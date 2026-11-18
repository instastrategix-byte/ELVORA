-- Ads Manager — billing ledger, statements, and conversion tracking.
--
-- Money model: advertisers prepay. Every movement of money is a row in ad_transactions
-- (credits positive, spend negative); advertiser_accounts.balance_minor is maintained from that
-- ledger by trigger and is never client-writable. Delivery spend is accounted at milli-minor
-- precision per account per day and posted to the ledger in the same transaction as the
-- measured event, under a lock on the account row, so concurrent events cannot overdraw it.
--
-- Tracking model: conversions arrive from a first-party pixel (consented, origin-restricted) or
-- a signed server API. Only consented events are stored; attribution is last-click within the
-- integration's click-through window. Ingestion runs only with the service role.

-- ---------------------------------------------------------------------------------------------
-- Account billing columns (the core Ads Manager migration may already have added these).
-- ---------------------------------------------------------------------------------------------
alter table public.advertiser_accounts add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');
alter table public.advertiser_accounts add column if not exists balance_minor bigint not null default 0;
alter table public.advertiser_accounts add column if not exists spend_limit_minor bigint check (spend_limit_minor is null or spend_limit_minor > 0);
alter table public.advertiser_accounts add column if not exists billing_status text not null default 'ok';

do $$
begin
  -- billing_status may be a text column (added here) or an enum (added by the core migration).
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'advertiser_accounts' and column_name = 'billing_status') = 'text'
     and not exists (select 1 from pg_constraint where conname = 'advertiser_accounts_billing_status_check') then
    alter table public.advertiser_accounts
      add constraint advertiser_accounts_billing_status_check check (billing_status in ('ok', 'payment_failed', 'suspended'));
  end if;
end;
$$;

-- Role check on an advertiser account. Uses the core migration's can_access_ad_account when it
-- exists; otherwise only the account owner qualifies (the owner satisfies every role).
create or replace function public.ad_account_has_role(p_account uuid, p_min text default 'analyst')
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if (select auth.uid()) is null or p_account is null then
    return false;
  end if;
  if to_regprocedure('public.can_access_ad_account(uuid,public.ad_member_role)') is not null then
    execute 'select public.can_access_ad_account($1, $2::public.ad_member_role)' into v_ok using p_account, p_min;
    return coalesce(v_ok, false);
  end if;
  return exists (select 1 from public.advertiser_accounts a where a.id = p_account and a.owner_id = (select auth.uid()));
end;
$$;
revoke execute on function public.ad_account_has_role(uuid, text) from public, anon;
grant execute on function public.ad_account_has_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Admin-configurable billing settings (no hardcoded commercial limits).
-- ---------------------------------------------------------------------------------------------
create table public.ad_billing_settings (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  min_top_up_minor bigint not null check (min_top_up_minor > 0),
  max_top_up_minor bigint not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (max_top_up_minor >= min_top_up_minor)
);
alter table public.ad_billing_settings enable row level security;
revoke all on public.ad_billing_settings from anon, authenticated;
grant select on public.ad_billing_settings to authenticated;
create policy "members read billing settings" on public.ad_billing_settings for select to authenticated using (true);
create policy "admins manage billing settings" on public.ad_billing_settings for all to authenticated
  using (public.is_staff('admin')) with check (public.is_staff('admin'));
grant insert, update, delete on public.ad_billing_settings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------------------------
create table public.ad_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  kind text not null check (kind in ('top_up', 'spend', 'refund', 'adjustment', 'credit', 'reversal')),
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text check (char_length(description) <= 300),
  provider text check (provider in ('stripe')),
  provider_ref text check (char_length(provider_ref) <= 200),
  idempotency_key text not null unique check (char_length(idempotency_key) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sign follows the kind: money in is positive, money out is negative.
  check (
    (kind in ('top_up', 'credit') and amount_minor > 0)
    or (kind in ('spend', 'reversal') and amount_minor <= 0)
    or (kind in ('refund', 'adjustment') and amount_minor <> 0)
  )
);
create index ad_transactions_account_idx on public.ad_transactions (account_id, created_at desc);
create index ad_transactions_provider_ref_idx on public.ad_transactions (provider_ref) where provider_ref is not null;
create index ad_transactions_created_by_idx on public.ad_transactions (created_by);

alter table public.ad_transactions enable row level security;
revoke all on public.ad_transactions from anon, authenticated;
grant select on public.ad_transactions to authenticated;
create policy "account members read transactions" on public.ad_transactions for select to authenticated
  using (public.ad_account_has_role(account_id, 'analyst') or public.is_staff('support'));

-- Validates ledger rows (append-only, account currency). BEFORE triggers also fire for rows
-- that ON CONFLICT later skips, so the balance itself is applied in the AFTER trigger below.
create or replace function public.ad_transactions_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
begin
  if tg_op = 'DELETE' then
    raise exception 'ledger rows cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.account_id <> old.account_id or new.currency <> old.currency or new.kind <> old.kind) then
    raise exception 'ledger rows are append-only' using errcode = '42501';
  end if;
  select currency into v_currency from public.advertiser_accounts where id = new.account_id for update;
  if v_currency is not null and v_currency <> new.currency then
    raise exception 'currency % does not match the advertiser account currency %', new.currency, v_currency using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Keeps balance_minor equal to the ledger sum.
create or replace function public.ad_transactions_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta bigint := new.amount_minor - case when tg_op = 'UPDATE' then old.amount_minor else 0 end;
begin
  update public.advertiser_accounts
  set balance_minor = balance_minor + v_delta,
      currency = coalesce(currency, new.currency)
  where id = new.account_id;
  return null;
end;
$$;

create trigger ad_transactions_validate before insert or update or delete on public.ad_transactions
  for each row execute function public.ad_transactions_validate();
create trigger ad_transactions_apply after insert or update on public.ad_transactions
  for each row execute function public.ad_transactions_apply();

-- Delivery spend at milli-minor precision, per account per UTC day.
create table public.ad_daily_spend (
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  day date not null,
  currency text not null,
  cost_milli bigint not null default 0 check (cost_milli >= 0),
  primary key (account_id, day)
);
alter table public.ad_daily_spend enable row level security;
revoke all on public.ad_daily_spend from anon, authenticated;
grant select on public.ad_daily_spend to authenticated;
create policy "account members read daily spend" on public.ad_daily_spend for select to authenticated
  using (public.ad_account_has_role(account_id, 'analyst') or public.is_staff('support'));

-- Posts the cost of every measured ad event of a prepaid account to the ledger. Runs inside the
-- delivery transaction: if the account cannot cover the (rounded-up) charge, the event itself is
-- rejected (the delivery engine also checks the balance before serving).
create or replace function public.ad_events_post_spend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_currency text;
  v_acc public.advertiser_accounts;
  v_old bigint;
  v_new bigint;
  v_charge bigint;
  v_day date := (new.occurred_at at time zone 'UTC')::date;
begin
  if new.cost_milli <= 0 then
    return new;
  end if;
  select c.advertiser_account_id, c.currency into v_account, v_currency from public.ad_campaigns c where c.id = new.campaign_id;
  -- Lock order: account row first (the same lock the ledger trigger takes).
  select * into v_acc from public.advertiser_accounts where id = v_account for update;
  -- Accounts on the original subscription model (billing_mode = 'subscription', from the core
  -- migration) are covered by their Advertiser plan: delivery is measured but not charged.
  if coalesce(to_jsonb(v_acc) ->> 'billing_mode', 'prepaid') <> 'prepaid' then
    return new;
  end if;
  if v_acc.currency is not null and v_acc.currency <> v_currency then
    raise exception 'campaign currency % does not match the account currency %', v_currency, v_acc.currency using errcode = '22023';
  end if;

  insert into public.ad_daily_spend (account_id, day, currency, cost_milli)
  values (v_account, v_day, v_currency, new.cost_milli)
  on conflict (account_id, day) do update set cost_milli = public.ad_daily_spend.cost_milli + excluded.cost_milli
  returning cost_milli into v_new;
  v_old := v_new - new.cost_milli;

  -- Additional whole minor units this event adds to the day's (rounded-up) charge.
  v_charge := ceil(v_new / 1000.0)::bigint - ceil(v_old / 1000.0)::bigint;
  if v_charge > 0 then
    if v_acc.balance_minor < v_charge then
      raise exception 'insufficient ad balance' using errcode = 'P0001';
    end if;
    insert into public.ad_transactions (account_id, kind, amount_minor, currency, description, idempotency_key)
    values (v_account, 'spend', -ceil(v_new / 1000.0)::bigint, v_currency, 'Ad delivery ' || v_day::text,
            'spend:' || v_account::text || ':' || v_day::text)
    on conflict (idempotency_key) do update set amount_minor = excluded.amount_minor;
  end if;
  return new;
end;
$$;

create trigger ad_events_post_spend after insert on public.ad_events
  for each row execute function public.ad_events_post_spend();

-- ---------------------------------------------------------------------------------------------
-- Ledger writers (service role for payments; admins for adjustments and status)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_record_top_up(
  p_account uuid, p_amount_minor bigint, p_currency text, p_session_id text, p_payment_intent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'invalid top-up amount' using errcode = '22023';
  end if;
  insert into public.ad_transactions (account_id, kind, amount_minor, currency, description, provider, provider_ref, idempotency_key)
  values (p_account, 'top_up', p_amount_minor, upper(p_currency), 'Account top-up', 'stripe', coalesce(p_payment_intent, p_session_id),
          'topup:' || p_session_id)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is not null then
    update public.advertiser_accounts set billing_status = 'ok' where id = p_account and billing_status::text = 'payment_failed';
  end if;
  return v_id is not null;
end;
$$;

-- A provider refund of a top-up. p_refunded_total is the cumulative refunded amount on the
-- charge, so replays and partial refunds converge to the right total.
create or replace function public.ad_record_refund(p_payment_intent text, p_charge_id text, p_refunded_total bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_top public.ad_transactions;
  v_already bigint;
  v_delta bigint;
begin
  select * into v_top from public.ad_transactions where kind = 'top_up' and provider_ref = p_payment_intent limit 1;
  if v_top.id is null then
    return false;
  end if;
  perform 1 from public.advertiser_accounts where id = v_top.account_id for update;
  select coalesce(-sum(amount_minor), 0) into v_already from public.ad_transactions
  where kind = 'reversal' and provider_ref = p_payment_intent;
  v_delta := least(p_refunded_total, v_top.amount_minor) - v_already;
  if v_delta <= 0 then
    return false;
  end if;
  insert into public.ad_transactions (account_id, kind, amount_minor, currency, description, provider, provider_ref, idempotency_key)
  values (v_top.account_id, 'reversal', -v_delta, v_top.currency, 'Top-up refunded', 'stripe', p_payment_intent,
          'refund:' || p_charge_id || ':' || p_refunded_total::text)
  on conflict (idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function public.ad_mark_payment_failed(p_account uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.advertiser_accounts set billing_status = 'payment_failed'
  where id = p_account and billing_status::text = 'ok';
$$;

revoke execute on function public.ad_record_top_up(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.ad_record_refund(text, text, bigint) from public, anon, authenticated;
revoke execute on function public.ad_mark_payment_failed(uuid) from public, anon, authenticated;
grant execute on function public.ad_record_top_up(uuid, bigint, text, text, text) to service_role;
grant execute on function public.ad_record_refund(text, text, bigint) to service_role;
grant execute on function public.ad_mark_payment_failed(uuid) to service_role;

create or replace function public.ad_adjust_balance(p_account uuid, p_amount_minor bigint, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acc public.advertiser_accounts;
  v_id uuid;
begin
  if not public.is_staff('admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor = 0 or char_length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'an amount and a reason are required' using errcode = '22023';
  end if;
  select * into v_acc from public.advertiser_accounts where id = p_account;
  if v_acc.id is null or v_acc.currency is null then
    raise exception 'account has no billing currency yet' using errcode = 'P0001';
  end if;
  insert into public.ad_transactions (account_id, kind, amount_minor, currency, description, idempotency_key, created_by)
  values (p_account, 'adjustment', p_amount_minor, v_acc.currency, left(trim(p_reason), 300),
          'adjust:' || gen_random_uuid()::text, (select auth.uid()))
  returning id into v_id;
  perform public.write_audit('ads.balance_adjusted', 'advertiser_account', p_account::text,
    jsonb_build_object('amount_minor', p_amount_minor, 'reason', p_reason));
  return v_id;
end;
$$;

create or replace function public.ad_set_billing_status(p_account uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('ok', 'payment_failed', 'suspended') then
    raise exception 'invalid billing status' using errcode = '22023';
  end if;
  execute format('update public.advertiser_accounts set billing_status = %L where id = %L', p_status, p_account);
  perform public.write_audit('ads.billing_status', 'advertiser_account', p_account::text,
    jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

revoke execute on function public.ad_adjust_balance(uuid, bigint, text) from public, anon;
revoke execute on function public.ad_set_billing_status(uuid, text, text) from public, anon;
grant execute on function public.ad_adjust_balance(uuid, bigint, text) to authenticated;
grant execute on function public.ad_set_billing_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Monthly statements of account (not tax invoices)
-- ---------------------------------------------------------------------------------------------
create table public.ad_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  opening_balance_minor bigint not null,
  top_ups_minor bigint not null,
  spend_minor bigint not null,
  adjustments_minor bigint not null,
  closing_balance_minor bigint not null,
  currency text not null,
  number text not null unique,
  issued_at timestamptz not null default now(),
  unique (account_id, period_start),
  check (period_end > period_start)
);
alter table public.ad_invoices enable row level security;
revoke all on public.ad_invoices from anon, authenticated;
grant select on public.ad_invoices to authenticated;
create policy "account members read statements" on public.ad_invoices for select to authenticated
  using (public.ad_account_has_role(account_id, 'analyst') or public.is_staff('support'));

create or replace function public.generate_ad_statement(p_account uuid, p_month date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_acc public.advertiser_accounts;
  v_id uuid;
  v_open bigint;
  v_top bigint;
  v_spend bigint;
  v_adj bigint;
begin
  if not (public.ad_account_has_role(p_account, 'admin') or public.is_staff('support')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_end > current_date then
    raise exception 'statements are available after the month ends' using errcode = 'P0001';
  end if;
  select id into v_id from public.ad_invoices where account_id = p_account and period_start = v_start;
  if v_id is not null then
    return v_id;
  end if;
  select * into v_acc from public.advertiser_accounts where id = p_account;
  if v_acc.currency is null then
    raise exception 'account has no billing activity' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount_minor), 0) into v_open from public.ad_transactions where account_id = p_account and created_at < v_start;
  select
    coalesce(sum(amount_minor) filter (where kind in ('top_up', 'credit')), 0),
    coalesce(-sum(amount_minor) filter (where kind = 'spend'), 0),
    coalesce(sum(amount_minor) filter (where kind in ('refund', 'adjustment', 'reversal')), 0)
  into v_top, v_spend, v_adj
  from public.ad_transactions
  where account_id = p_account and created_at >= v_start and created_at < v_end;
  insert into public.ad_invoices (account_id, period_start, period_end, opening_balance_minor, top_ups_minor, spend_minor,
                                  adjustments_minor, closing_balance_minor, currency, number)
  values (p_account, v_start, v_end, v_open, v_top, v_spend, v_adj, v_open + v_top - v_spend + v_adj, v_acc.currency,
          'ELV-ADS-' || to_char(v_start, 'YYYYMM') || '-' || upper(left(replace(p_account::text, '-', ''), 10)))
  on conflict (account_id, period_start) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.ad_invoices where account_id = p_account and period_start = v_start;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.generate_ad_statement(uuid, date) from public, anon;
grant execute on function public.generate_ad_statement(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Conversion tracking
-- ---------------------------------------------------------------------------------------------
create table public.ad_tracking_integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('pixel', 'server')),
  public_key text not null unique,
  -- Fingerprint of the server signing secret (SHA-256 hex); the secret itself is in
  -- ad_tracking_secrets, readable only by the service role.
  secret_hash text,
  allowed_domains text[] not null default '{}' check (cardinality(allowed_domains) <= 20),
  attribution_window_days smallint not null default 7 check (attribution_window_days in (1, 7, 28)),
  verified_at timestamptz,
  last_event_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'server' or cardinality(allowed_domains) >= 1)
);
create index ad_tracking_integrations_account_idx on public.ad_tracking_integrations (account_id);
create index ad_tracking_integrations_created_by_idx on public.ad_tracking_integrations (created_by);

create table public.ad_tracking_secrets (
  integration_id uuid primary key references public.ad_tracking_integrations (id) on delete cascade,
  secret text not null,
  rotated_at timestamptz not null default now()
);

alter table public.ad_tracking_integrations enable row level security;
alter table public.ad_tracking_secrets enable row level security;
revoke all on public.ad_tracking_integrations from anon, authenticated;
revoke all on public.ad_tracking_secrets from anon, authenticated;
grant select on public.ad_tracking_integrations to authenticated;
create policy "account members read integrations" on public.ad_tracking_integrations for select to authenticated
  using (public.ad_account_has_role(account_id, 'analyst') or public.is_staff('support'));

create table public.ad_conversions (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.ad_tracking_integrations (id) on delete cascade,
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  event_name text not null check (event_name in ('lead', 'purchase', 'sign_up', 'page_view', 'custom')),
  custom_name text check (char_length(custom_name) <= 60),
  event_id text not null check (char_length(event_id) between 1 and 128),
  click_id uuid,
  attributed boolean not null default false,
  ad_id uuid,
  ad_set_id uuid,
  campaign_id uuid references public.ad_campaigns (id) on delete set null,
  value_minor bigint check (value_minor is null or value_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  page_url text check (char_length(page_url) <= 500),
  consent boolean not null check (consent),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique (integration_id, event_id),
  check (event_name <> 'custom' or custom_name is not null)
);
create index ad_conversions_campaign_idx on public.ad_conversions (campaign_id, occurred_at) where attributed;
create index ad_conversions_account_idx on public.ad_conversions (account_id, occurred_at desc);
create index ad_conversions_ad_idx on public.ad_conversions (ad_id) where ad_id is not null;
create index ad_conversions_ad_set_idx on public.ad_conversions (ad_set_id) where ad_set_id is not null;

alter table public.ad_conversions enable row level security;
revoke all on public.ad_conversions from anon, authenticated;
grant select on public.ad_conversions to authenticated;
create policy "account members read conversions" on public.ad_conversions for select to authenticated
  using (public.ad_account_has_role(account_id, 'analyst') or public.is_staff('support'));

-- Link to the core Ads Manager tables when they exist.
do $$
begin
  if to_regclass('public.advertisements') is not null then
    alter table public.ad_conversions add constraint ad_conversions_ad_fk foreign key (ad_id) references public.advertisements (id) on delete set null;
  end if;
  if to_regclass('public.ad_sets') is not null then
    alter table public.ad_conversions add constraint ad_conversions_ad_set_fk foreign key (ad_set_id) references public.ad_sets (id) on delete set null;
  end if;
end;
$$;

create table public.ad_tracking_diagnostics (
  id bigint generated always as identity primary key,
  integration_id uuid not null references public.ad_tracking_integrations (id) on delete cascade,
  level text not null check (level in ('info', 'warning', 'error')),
  code text not null check (char_length(code) <= 40),
  message text not null check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index ad_tracking_diagnostics_integration_idx on public.ad_tracking_diagnostics (integration_id, id desc);
alter table public.ad_tracking_diagnostics enable row level security;
revoke all on public.ad_tracking_diagnostics from anon, authenticated;
grant select on public.ad_tracking_diagnostics to authenticated;
create policy "account members read diagnostics" on public.ad_tracking_diagnostics for select to authenticated
  using (exists (select 1 from public.ad_tracking_integrations i where i.id = integration_id
                 and (public.ad_account_has_role(i.account_id, 'analyst') or public.is_staff('support'))));

create or replace function public.ad_tracking_diagnose(p_integration uuid, p_level text, p_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ad_tracking_diagnostics (integration_id, level, code, message) values (p_integration, p_level, p_code, left(p_message, 300));
  -- Keep the most recent 200 entries per integration.
  delete from public.ad_tracking_diagnostics d
  where d.integration_id = p_integration
    and d.id < (select min(x.id) from (select id from public.ad_tracking_diagnostics where integration_id = p_integration order by id desc limit 200) x);
end;
$$;
revoke execute on function public.ad_tracking_diagnose(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ad_tracking_diagnose(uuid, text, text, text) to service_role;

-- Integration management (admin+ on the account). Secrets are returned once.
create or replace function public.ad_new_secret()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'elvsk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;
revoke execute on function public.ad_new_secret() from public, anon, authenticated;

create or replace function public.create_ad_tracking_integration(
  p_account uuid, p_name text, p_kind text, p_domains text[] default '{}', p_window smallint default 7
)
returns table (integration_id uuid, public_key text, secret text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_key text := 'elvpx_' || replace(gen_random_uuid()::text, '-', '');
  v_secret text;
  v_domains text[];
begin
  if not public.ad_account_has_role(p_account, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select count(*) from public.ad_tracking_integrations i where i.account_id = p_account) >= 10 then
    raise exception 'an account can have at most 10 integrations' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct lower(trim(d))), '{}') into v_domains
  from unnest(coalesce(p_domains, '{}')) d where trim(d) <> '';
  if exists (select 1 from unnest(v_domains) d where d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$') then
    raise exception 'domains must be plain host names such as shop.example.com' using errcode = '22023';
  end if;
  insert into public.ad_tracking_integrations (account_id, name, kind, public_key, allowed_domains, attribution_window_days, created_by)
  values (p_account, trim(p_name), p_kind, v_key, v_domains, coalesce(p_window, 7), (select auth.uid()))
  returning id into v_id;
  if p_kind = 'server' then
    v_secret := public.ad_new_secret();
    insert into public.ad_tracking_secrets (integration_id, secret) values (v_id, v_secret);
    update public.ad_tracking_integrations set secret_hash = encode(sha256(convert_to(v_secret, 'UTF8')), 'hex') where id = v_id;
  end if;
  integration_id := v_id;
  public_key := v_key;
  secret := v_secret;
  return next;
end;
$$;

create or replace function public.rotate_ad_tracking_secret(p_integration uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.ad_tracking_integrations;
  v_secret text := public.ad_new_secret();
begin
  select * into v_i from public.ad_tracking_integrations where id = p_integration;
  if v_i.id is null or not public.ad_account_has_role(v_i.account_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_i.kind <> 'server' then
    raise exception 'only server integrations have a secret' using errcode = 'P0001';
  end if;
  insert into public.ad_tracking_secrets (integration_id, secret) values (p_integration, v_secret)
  on conflict (integration_id) do update set secret = excluded.secret, rotated_at = now();
  update public.ad_tracking_integrations set secret_hash = encode(sha256(convert_to(v_secret, 'UTF8')), 'hex') where id = p_integration;
  return v_secret;
end;
$$;

create or replace function public.update_ad_tracking_integration(p_integration uuid, p_name text, p_domains text[], p_window smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.ad_tracking_integrations;
  v_domains text[];
begin
  select * into v_i from public.ad_tracking_integrations where id = p_integration;
  if v_i.id is null or not public.ad_account_has_role(v_i.account_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(trim(d))), '{}') into v_domains from unnest(coalesce(p_domains, '{}')) d where trim(d) <> '';
  if exists (select 1 from unnest(v_domains) d where d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$') then
    raise exception 'domains must be plain host names such as shop.example.com' using errcode = '22023';
  end if;
  update public.ad_tracking_integrations
  set name = coalesce(nullif(trim(p_name), ''), name), allowed_domains = v_domains,
      attribution_window_days = coalesce(p_window, attribution_window_days)
  where id = p_integration;
end;
$$;

create or replace function public.delete_ad_tracking_integration(p_integration uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.ad_tracking_integrations;
begin
  select * into v_i from public.ad_tracking_integrations where id = p_integration;
  if v_i.id is null or not public.ad_account_has_role(v_i.account_id, 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.ad_tracking_integrations where id = p_integration;
end;
$$;

revoke execute on function public.create_ad_tracking_integration(uuid, text, text, text[], smallint) from public, anon;
revoke execute on function public.rotate_ad_tracking_secret(uuid) from public, anon;
revoke execute on function public.update_ad_tracking_integration(uuid, text, text[], smallint) from public, anon;
revoke execute on function public.delete_ad_tracking_integration(uuid) from public, anon;
grant execute on function public.create_ad_tracking_integration(uuid, text, text, text[], smallint) to authenticated;
grant execute on function public.rotate_ad_tracking_secret(uuid) to authenticated;
grant execute on function public.update_ad_tracking_integration(uuid, text, text[], smallint) to authenticated;
grant execute on function public.delete_ad_tracking_integration(uuid) to authenticated;

-- Conversion ingestion (service role only: called by /api/ads/collect and /api/ads/conversions).
-- Returns one of: stored, duplicate, no_consent, domain_not_allowed, unknown_integration.
create or replace function public.ingest_ad_conversion(
  p_public_key text,
  p_event_name text,
  p_event_id text,
  p_consent boolean,
  p_origin_host text default null,
  p_click_id uuid default null,
  p_value_minor bigint default null,
  p_currency text default null,
  p_page_url text default null,
  p_custom_name text default null,
  p_occurred_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i public.ad_tracking_integrations;
  v_occurred timestamptz := least(coalesce(p_occurred_at, now()), now());
  v_imp public.ad_events;
  v_camp public.ad_campaigns;
  v_click_at timestamptz;
  v_attributed boolean := false;
  v_campaign uuid;
  v_ad uuid;
  v_ad_set uuid;
  v_id uuid;
  v_host text := lower(nullif(trim(p_origin_host), ''));
begin
  select * into v_i from public.ad_tracking_integrations where public_key = p_public_key;
  if v_i.id is null then
    return 'unknown_integration';
  end if;

  -- Browser events must come from one of the advertiser's verified-by-config domains.
  if v_i.kind = 'pixel' then
    if v_host is null or not exists (
      select 1 from unnest(v_i.allowed_domains) d where v_host = d or v_host like '%.' || d
    ) then
      perform public.ad_tracking_diagnose(v_i.id, 'warning', 'domain_not_allowed',
        'Event from ' || coalesce(v_host, 'an unknown origin') || ' was rejected: add the domain to this pixel.');
      return 'domain_not_allowed';
    end if;
  end if;

  if not coalesce(p_consent, false) then
    perform public.ad_tracking_diagnose(v_i.id, 'info', 'no_consent', 'An event without consent was received and discarded.');
    return 'no_consent';
  end if;

  if p_occurred_at is not null and p_occurred_at < now() - interval '28 days' then
    perform public.ad_tracking_diagnose(v_i.id, 'warning', 'too_old', 'An event older than 28 days was discarded.');
    return 'too_old';
  end if;

  -- Last-click attribution: the click must belong to this advertiser and fall inside the window.
  if p_click_id is not null then
    select * into v_imp from public.ad_events where id = p_click_id and event_type = 'impression';
    if v_imp.id is not null then
      select * into v_camp from public.ad_campaigns where id = v_imp.campaign_id;
      if v_camp.advertiser_account_id = v_i.account_id then
        select max(e.occurred_at) into v_click_at from public.ad_events e
        where e.impression_id = v_imp.id and e.event_type = 'click';
        if v_click_at is not null and v_click_at <= v_occurred
           and v_occurred - v_click_at <= make_interval(days => v_i.attribution_window_days::int) then
          v_attributed := true;
          v_campaign := v_camp.id;
          v_ad := nullif(to_jsonb(v_imp) ->> 'ad_id', '')::uuid;
          v_ad_set := nullif(to_jsonb(v_imp) ->> 'ad_set_id', '')::uuid;
        end if;
      end if;
    end if;
  end if;

  insert into public.ad_conversions (integration_id, account_id, event_name, custom_name, event_id, click_id, attributed,
                                     ad_id, ad_set_id, campaign_id, value_minor, currency, page_url, consent, occurred_at)
  values (v_i.id, v_i.account_id, p_event_name, nullif(trim(p_custom_name), ''), p_event_id,
          case when v_attributed then p_click_id end, v_attributed, v_ad, v_ad_set, v_campaign,
          p_value_minor, upper(nullif(p_currency, '')), left(p_page_url, 500), true, v_occurred)
  on conflict (integration_id, event_id) do nothing
  returning id into v_id;

  update public.ad_tracking_integrations
  set last_event_at = now(), verified_at = coalesce(verified_at, now())
  where id = v_i.id;

  if v_id is null then
    return 'duplicate';
  end if;
  return 'stored';
end;
$$;
revoke execute on function public.ingest_ad_conversion(text, text, text, boolean, text, uuid, bigint, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.ingest_ad_conversion(text, text, text, boolean, text, uuid, bigint, text, text, text, timestamptz) to service_role;

-- Server API: fetches the signing secret for a server integration (service role only).
create or replace function public.ad_tracking_signing_secret(p_public_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.secret from public.ad_tracking_secrets s
  join public.ad_tracking_integrations i on i.id = s.integration_id
  where i.public_key = p_public_key and i.kind = 'server';
$$;
revoke execute on function public.ad_tracking_signing_secret(text) from public, anon, authenticated;
grant execute on function public.ad_tracking_signing_secret(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Billing overview for the Ads Manager (analyst+ on the account, or staff).
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_billing_overview(p_account uuid)
returns table (
  currency text,
  balance_minor bigint,
  spend_limit_minor bigint,
  billing_status text,
  billing_mode text,
  spend_this_month_minor bigint,
  spend_today_minor bigint,
  min_top_up_minor bigint,
  max_top_up_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc public.advertiser_accounts;
begin
  if not (public.ad_account_has_role(p_account, 'analyst') or public.is_staff('support')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_acc from public.advertiser_accounts where id = p_account;
  if v_acc.id is null then
    return;
  end if;
  currency := v_acc.currency;
  balance_minor := v_acc.balance_minor;
  spend_limit_minor := v_acc.spend_limit_minor;
  billing_status := v_acc.billing_status::text;
  billing_mode := coalesce(to_jsonb(v_acc) ->> 'billing_mode', 'prepaid');
  select coalesce(ceil(sum(s.cost_milli) / 1000.0), 0)::bigint into spend_this_month_minor
  from public.ad_daily_spend s where s.account_id = p_account and s.day >= date_trunc('month', current_date)::date;
  select coalesce(ceil(sum(s.cost_milli) / 1000.0), 0)::bigint into spend_today_minor
  from public.ad_daily_spend s where s.account_id = p_account and s.day = current_date;
  select b.min_top_up_minor, b.max_top_up_minor into min_top_up_minor, max_top_up_minor
  from public.ad_billing_settings b where b.currency = v_acc.currency and b.active;
  return next;
end;
$$;
revoke execute on function public.ad_billing_overview(uuid) from public, anon;
grant execute on function public.ad_billing_overview(uuid) to authenticated;
