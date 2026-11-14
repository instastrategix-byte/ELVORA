-- Membership catalog, applications, invitations, subscriptions, payments and identity verification.
--
-- Separation of concerns (docs/PRODUCT_SPEC.md Â§Roles):
--   * Membership (what you pay for)      -> subscriptions, written only by payment webhooks.
--   * Application/approval (who you are) -> membership_applications, decided by staff.
--   * Identity verification (badges)      -> verifications, decided by staff.
-- Paying never implies verification, and verification never implies paid features.

create type public.plan_audience as enum ('individual', 'premium', 'professional', 'business', 'advertiser');
create type public.billing_interval as enum ('month', 'year');
create type public.application_status as enum ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn');
create type public.payment_provider as enum ('stripe', 'razorpay');
create type public.subscription_status as enum ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused', 'canceled', 'expired');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.verification_status as enum ('pending', 'approved', 'rejected', 'revoked');

-- ---------------------------------------------------------------------------
-- Plan catalog. Features are capability keys checked by RLS and by the app
-- (src/modules/membership/features.ts mirrors the key list).
-- ---------------------------------------------------------------------------
create table public.membership_plans (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  tagline text,
  description text,
  audience public.plan_audience not null,
  features text[] not null default '{}',
  is_free boolean not null default false,
  requires_application boolean not null default false,
  required_verifications public.verification_kind[] not null default '{}',
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger membership_plans_set_updated_at
  before update on public.membership_plans
  for each row execute function public.set_updated_at();

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.membership_plans (id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval public.billing_interval not null,
  amount_minor bigint not null check (amount_minor >= 0),
  stripe_price_id text,
  razorpay_plan_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, currency, billing_interval)
);

-- Catalog structure is product configuration and ships with the schema.
-- Prices are commercial decisions: they are NOT inserted here. Local prices live in
-- supabase/seed.sql; production prices are inserted per docs/DEPLOYMENT_RUNBOOK.md.
insert into public.membership_plans (id, name, tagline, description, audience, features, is_free, requires_application, required_verifications, trial_days, sort_order) values
  ('standard', 'Member', 'Your entry to the ELVORA network.',
   'Create a profile, share posts, connect and message your connections.',
   'individual', array['feed.post', 'connections.request', 'messages.send', 'discover.members'], true, false, '{}', 0, 10),
  ('premium', 'Premium', 'Private discovery and members-only luxury access.',
   'Everything in Member, plus advanced discovery filters, members-only listings and direct inquiries to verified providers.',
   'premium', array['feed.post', 'connections.request', 'messages.send', 'discover.members', 'discover.advanced', 'luxury.view_members', 'luxury.inquire'], false, true, '{}', 0, 20),
  ('professional', 'Verified Professional', 'For public figures, founders and executives.',
   'Premium access with a verified professional presence. Requires approved public-figure or executive verification.',
   'professional', array['feed.post', 'connections.request', 'messages.send', 'discover.members', 'discover.advanced', 'luxury.view_members', 'luxury.inquire'], false, true, array['public_figure', 'executive']::public.verification_kind[], 0, 30),
  ('business', 'Luxury Business', 'For hotels, villas, yachts, automotive and experience providers.',
   'Business profile, listing management and inquiry inbox. Listings publish once your business is verified.',
   'business', array['feed.post', 'connections.request', 'messages.send', 'discover.members', 'business.manage', 'listings.publish'], false, true, '{}', 0, 40),
  ('advertiser', 'Advertiser', 'Campaigns for luxury brands.',
   'Create and manage sponsored campaigns reviewed by the ELVORA team.',
   'advertiser', array['feed.post', 'connections.request', 'messages.send', 'discover.members', 'ads.manage'], false, true, '{}', 0, 50);

-- ---------------------------------------------------------------------------
-- Identity verification (person-level). Business verification is the business
-- review workflow in the commerce migration.
-- ---------------------------------------------------------------------------
create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.verification_kind not null,
  status public.verification_status not null default 'pending',
  statement text check (char_length(statement) <= 2000),
  evidence_paths text[] not null default '{}' check (cardinality(evidence_paths) <= 5),
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index verifications_one_open_per_kind on public.verifications (user_id, kind)
  where status in ('pending', 'approved');

create trigger verifications_set_updated_at
  before update on public.verifications
  for each row execute function public.set_updated_at();

-- Keep profiles.verified_kinds (public badge data) in sync with approved verifications.
create or replace function public.sync_verified_kinds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
  set verified_kinds = coalesce((
    select array_agg(distinct v.kind order by v.kind)
    from public.verifications v
    where v.user_id = v_user and v.status = 'approved'
  ), '{}')
  where p.id = v_user;
  return null;
end;
$$;

create trigger verifications_sync_badges
  after insert or update or delete on public.verifications
  for each row execute function public.sync_verified_kinds();

-- ---------------------------------------------------------------------------
-- Invitations (codes are stored hashed)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  plan_id text not null references public.membership_plans (id),
  email text,
  pre_approved boolean not null default false,
  max_uses integer not null default 1 check (max_uses between 1 and 1000),
  use_count integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.hash_invitation_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(upper(trim(p_code)), 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Membership applications
-- ---------------------------------------------------------------------------
create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.membership_plans (id),
  status public.application_status not null default 'submitted',
  statement text check (char_length(statement) <= 2000),
  invitation_id uuid references public.invitations (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index membership_applications_one_open on public.membership_applications (user_id, plan_id)
  where status in ('submitted', 'under_review', 'approved');

create trigger membership_applications_set_updated_at
  before update on public.membership_applications
  for each row execute function public.set_updated_at();

-- Public, anonymous-safe invitation check: reveals only validity and plan name.
create or replace function public.check_invitation(p_code text)
returns table (valid boolean, plan_id text, plan_name text, pre_approved boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.valid, c.plan_id, c.plan_name, c.pre_approved
  from (
    select true as valid, i.plan_id, p.name as plan_name, i.pre_approved
    from public.invitations i
    join public.membership_plans p on p.id = i.plan_id and p.active
    where i.code_hash = public.hash_invitation_code(p_code)
      and i.revoked_at is null
      and (i.expires_at is null or i.expires_at > now())
      and i.use_count < i.max_uses
    union all
    select false, null, null, false
  ) c
  order by c.valid desc
  limit 1;
$$;

create or replace function public.redeem_invitation(p_code text, p_statement text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_email text;
  v_app_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_inv
  from public.invitations
  where code_hash = public.hash_invitation_code(p_code)
  for update;

  if v_inv.id is null or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or v_inv.use_count >= v_inv.max_uses then
    raise exception 'invitation invalid or expired' using errcode = 'P0001';
  end if;

  if v_inv.email is not null then
    select u.email into v_email from auth.users u where u.id = auth.uid();
    if lower(v_email) is distinct from lower(v_inv.email) then
      raise exception 'invitation issued to a different email' using errcode = 'P0001';
    end if;
  end if;

  insert into public.membership_applications (user_id, plan_id, status, statement, invitation_id, decided_at)
  values (
    auth.uid(), v_inv.plan_id,
    case when v_inv.pre_approved then 'approved'::public.application_status else 'submitted'::public.application_status end,
    left(p_statement, 2000), v_inv.id,
    case when v_inv.pre_approved then now() end
  )
  returning id into v_app_id;

  update public.invitations set use_count = use_count + 1 where id = v_inv.id;
  perform public.write_audit('invitation.redeemed', 'invitation', v_inv.id::text, jsonb_build_object('application_id', v_app_id));
  return v_app_id;
end;
$$;

create or replace function public.withdraw_application(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.membership_applications
  set status = 'withdrawn'
  where id = p_id and user_id = auth.uid() and status in ('submitted', 'under_review');
  if not found then
    raise exception 'application cannot be withdrawn' using errcode = 'P0001';
  end if;
end;
$$;

-- Staff decision on an application.
create or replace function public.decide_application(p_id uuid, p_status public.application_status, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('under_review', 'approved', 'rejected') then
    raise exception 'invalid decision' using errcode = 'P0001';
  end if;
  update public.membership_applications
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewer_notes = left(p_notes, 2000),
      decided_at = case when p_status in ('approved', 'rejected') then now() end
  where id = p_id and status in ('submitted', 'under_review');
  if not found then
    raise exception 'application not open' using errcode = 'P0001';
  end if;
  perform public.write_audit('application.' || p_status::text, 'membership_application', p_id::text, '{}');
end;
$$;

create or replace function public.decide_verification(p_id uuid, p_status public.verification_status, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'revoked') then
    raise exception 'invalid decision' using errcode = 'P0001';
  end if;
  update public.verifications
  set status = p_status, reviewer_id = auth.uid(), reviewer_notes = left(p_notes, 2000), reviewed_at = now()
  where id = p_id
    and ((p_status in ('approved', 'rejected') and status = 'pending') or (p_status = 'revoked' and status = 'approved'));
  if not found then
    raise exception 'verification not in a decidable state' using errcode = 'P0001';
  end if;
  perform public.write_audit('verification.' || p_status::text, 'verification', p_id::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Billing records â€” written ONLY by the service role from verified webhooks.
-- ---------------------------------------------------------------------------
create table public.billing_customers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.payment_provider not null,
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider),
  unique (provider, provider_customer_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.membership_plans (id),
  price_id uuid references public.plan_prices (id) on delete set null,
  provider public.payment_provider not null,
  provider_subscription_id text not null,
  status public.subscription_status not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create index subscriptions_user_idx on public.subscriptions (user_id, status);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider public.payment_provider not null,
  provider_payment_id text not null,
  amount_minor bigint not null,
  currency text not null,
  status public.payment_status not null,
  refunded_amount_minor bigint not null default 0 check (refunded_amount_minor >= 0),
  description text,
  -- Hosted invoice / receipt page from the provider. Card data is never stored.
  receipt_url text,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index payments_user_idx on public.payments (user_id, created_at desc);

create trigger membership_applications_status_history after insert or update on public.membership_applications
  for each row execute function public.track_status_change('membership_application', 'status', 'user_id');
create trigger verifications_status_history after insert or update on public.verifications
  for each row execute function public.track_status_change('verification', 'status', 'user_id');
create trigger subscriptions_status_history after insert or update on public.subscriptions
  for each row execute function public.track_status_change('subscription', 'status', 'user_id');

-- Webhook idempotency ledger.
create table public.webhook_events (
  provider public.payment_provider not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Entitlements
-- ---------------------------------------------------------------------------
create or replace function public.has_active_subscription(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Feature keys the user holds: the free plan for every active member, plus the
-- features of plans backed by a live subscription. Suspended accounts hold none.
create or replace function public.user_features(p_user uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct f), '{}')
  from (
    select unnest(p.features) as f
    from public.membership_plans p
    where p.is_free and p.active and public.is_active_member(p_user)
    union
    select unnest(p.features)
    from public.subscriptions s
    join public.membership_plans p on p.id = s.plan_id
    where s.user_id = p_user
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and public.is_active_member(p_user)
  ) features;
$$;

create or replace function public.has_feature(p_feature text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_feature = any(public.user_features(p_user));
$$;

-- Eligibility to start checkout for a plan: approved application when required,
-- and an approved verification of an accepted kind when required.
create or replace function public.is_eligible_for_plan(p_plan_id text, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membership_plans p
    where p.id = p_plan_id and p.active and not p.is_free
      and public.is_active_member(p_user)
      and (not p.requires_application or exists (
        select 1 from public.membership_applications a
        where a.user_id = p_user and a.plan_id = p.id and a.status = 'approved'))
      and (cardinality(p.required_verifications) = 0 or exists (
        select 1 from public.verifications v
        where v.user_id = p_user and v.status = 'approved' and v.kind = any(p.required_verifications)))
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.membership_plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.verifications enable row level security;
alter table public.invitations enable row level security;
alter table public.membership_applications enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.membership_plans, public.plan_prices, public.verifications, public.invitations,
  public.membership_applications, public.billing_customers, public.subscriptions, public.payments,
  public.webhook_events from anon, authenticated;

grant select on public.membership_plans, public.plan_prices to anon, authenticated;
create policy "active plans are public" on public.membership_plans for select using (active);
create policy "active prices are public" on public.plan_prices for select using (active);

grant select on public.verifications to authenticated;
grant insert (user_id, kind, statement, evidence_paths) on public.verifications to authenticated;
create policy "own or staff read verifications" on public.verifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff('moderator'));
create policy "members request verification" on public.verifications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and public.is_active_member());

grant select on public.membership_applications to authenticated;
grant insert (user_id, plan_id, statement) on public.membership_applications to authenticated;
create policy "own or staff read applications" on public.membership_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff('moderator'));
create policy "members apply" on public.membership_applications
  for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'submitted' and invitation_id is null
    and exists (select 1 from public.membership_plans p where p.id = plan_id and p.active and p.requires_application)
  );

grant select on public.invitations to authenticated;
create policy "staff read invitations" on public.invitations
  for select to authenticated using (public.is_staff('moderator'));

grant select on public.subscriptions, public.payments to authenticated;
create policy "own subscriptions" on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_staff('support'));
create policy "own payments" on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_staff('support'));

-- billing_customers and webhook_events: no client access at all (service role only).

revoke execute on function public.redeem_invitation(text, text) from public, anon;
revoke execute on function public.withdraw_application(uuid) from public, anon;
revoke execute on function public.decide_application(uuid, public.application_status, text) from public, anon;
revoke execute on function public.decide_verification(uuid, public.verification_status, text) from public, anon;
