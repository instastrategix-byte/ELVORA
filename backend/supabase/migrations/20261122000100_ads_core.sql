-- ELVORA Ads Manager — core.
--
-- Builds a campaign → ad set → ad hierarchy (with reusable creatives, audiences, reviews and
-- appeals) on top of the original single-level campaigns from 20261026000400_commerce.sql, and a
-- delivery engine that serves both. Original ("legacy") campaigns keep working unchanged through a
-- compatibility path; existing rows are migrated into the new hierarchy at the end of this file.
--
-- Money: budgets and prices are minor units (cents); delivery costs in ad_events are milli-minor
-- units, exactly as before. Prices come only from the admin-managed rate card.
-- Billing (balance top-ups, ledger, invoices) and conversion tracking live in the next migration
-- (20261122000200_ads_billing_tracking.sql); this one only *reads* advertiser_accounts.balance_minor.

-- New objective values (used only at runtime below, so adding them here is safe).
alter type public.campaign_objective add value if not exists 'reach';
alter type public.campaign_objective add value if not exists 'engagement';
alter type public.campaign_objective add value if not exists 'leads';
alter type public.campaign_objective add value if not exists 'conversions';
alter type public.campaign_objective add value if not exists 'event_promotion';

create type public.ad_billing_status as enum ('ok', 'payment_failed', 'suspended');
create type public.ad_member_role as enum ('owner', 'admin', 'editor', 'analyst');
create type public.ad_entity_status as enum ('draft', 'active', 'paused', 'archived');
create type public.ad_review_status as enum ('draft', 'pending', 'approved', 'rejected', 'changes_requested');

-- ---------------------------------------------------------------------------------------------
-- Advertiser accounts and their team
-- ---------------------------------------------------------------------------------------------
alter table public.advertiser_accounts
  add column currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- Trusted: maintained by the billing ledger (next migration). Never client-writable.
  add column balance_minor bigint not null default 0,
  add column spend_limit_minor bigint check (spend_limit_minor is null or spend_limit_minor > 0),
  -- Trusted: set by billing / staff.
  add column billing_status public.ad_billing_status not null default 'ok',
  add column timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  -- 'prepaid': delivery draws down balance_minor. 'subscription': the original model, where the
  -- Advertiser plan covers delivery and no balance is required. Accounts that existed before the
  -- Ads Manager are backfilled to 'subscription' below. Trusted.
  add column billing_mode text not null default 'prepaid' check (billing_mode in ('prepaid', 'subscription'));

create table public.advertiser_members (
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.ad_member_role not null,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index advertiser_members_user_idx on public.advertiser_members (user_id);
create index advertiser_members_added_by_idx on public.advertiser_members (added_by);
create unique index advertiser_members_one_owner on public.advertiser_members (account_id) where role = 'owner';

insert into public.advertiser_members (account_id, user_id, role)
select id, owner_id, 'owner' from public.advertiser_accounts
on conflict do nothing;

create or replace function public.ad_account_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.advertiser_members (account_id, user_id, role, added_by)
  values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger advertiser_accounts_owner_member after insert on public.advertiser_accounts
  for each row execute function public.ad_account_add_owner_member();

-- Caller's role on an account (null when not a member). Staff are handled separately.
create or replace function public.ad_account_role(p_account uuid)
returns public.ad_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.advertiser_members m
  where m.account_id = p_account and m.user_id = (select auth.uid());
$$;

create or replace function public.ad_role_rank(p_role public.ad_member_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 when 'analyst' then 1 else 0 end;
$$;

-- True when the caller holds at least p_min on the account (owner > admin > editor > analyst).
create or replace function public.can_access_ad_account(p_account uuid, p_min public.ad_member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.ad_role_rank(public.ad_account_role(p_account)) >= public.ad_role_rank(p_min), false);
$$;

-- Read access for account members and moderating staff.
create or replace function public.can_read_ad_account(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_ad_account(p_account, 'analyst') or public.is_staff('moderator');
$$;

alter table public.advertiser_members enable row level security;
revoke all on public.advertiser_members from anon, authenticated;
grant select on public.advertiser_members to authenticated;
create policy "ad account members read the team" on public.advertiser_members
  for select to authenticated using (public.can_read_ad_account(account_id));

-- Accounts: team members can read; owners/admins edit settings. Trusted columns stay ungranted.
create policy "ad account members read accounts" on public.advertiser_accounts
  for select to authenticated using (public.can_read_ad_account(id));
create policy "ad account admins edit settings" on public.advertiser_accounts
  for update to authenticated
  using (public.can_access_ad_account(id, 'admin'))
  with check (public.can_access_ad_account(id, 'admin') and (business_id is null or public.is_business_owner(business_id)));
grant insert (currency, timezone) on public.advertiser_accounts to authenticated;
grant update (spend_limit_minor, timezone) on public.advertiser_accounts to authenticated;

-- Team management. Owners can add admins; admins can add editors and analysts.
create or replace function public.add_ad_account_member(p_account uuid, p_user uuid, p_role public.ad_member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_my_role public.ad_member_role := public.ad_account_role(p_account);
begin
  if v_my_role is null or public.ad_role_rank(v_my_role) < public.ad_role_rank('admin') then
    raise exception 'Only account owners and admins can manage the team' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'An account has exactly one owner' using errcode = '22023';
  end if;
  if p_role = 'admin' and v_my_role <> 'owner' then
    raise exception 'Only the owner can add admins' using errcode = '42501';
  end if;
  if not public.is_active_member(p_user) then
    raise exception 'That person is not an active ELVORA member' using errcode = '22023';
  end if;
  insert into public.advertiser_members (account_id, user_id, role, added_by)
  values (p_account, p_user, p_role, (select auth.uid()));
  perform public.write_audit('ad_account.member_added', 'advertiser_account', p_account::text, jsonb_build_object('user', p_user, 'role', p_role));
exception when unique_violation then
  raise exception 'That person is already on this account' using errcode = '23505';
end;
$$;

create or replace function public.set_ad_account_member_role(p_account uuid, p_user uuid, p_role public.ad_member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_my_role public.ad_member_role := public.ad_account_role(p_account);
  v_their_role public.ad_member_role;
begin
  select role into v_their_role from public.advertiser_members where account_id = p_account and user_id = p_user for update;
  if v_their_role is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_their_role = 'owner' or p_role = 'owner' then
    raise exception 'The owner role cannot be changed here' using errcode = '22023';
  end if;
  if v_my_role is distinct from 'owner' and (v_my_role is distinct from 'admin' or v_their_role = 'admin' or p_role = 'admin') then
    raise exception 'You cannot change this member''s role' using errcode = '42501';
  end if;
  update public.advertiser_members set role = p_role where account_id = p_account and user_id = p_user;
  perform public.write_audit('ad_account.member_role', 'advertiser_account', p_account::text, jsonb_build_object('user', p_user, 'role', p_role));
end;
$$;

create or replace function public.remove_ad_account_member(p_account uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_my_role public.ad_member_role := public.ad_account_role(p_account);
  v_their_role public.ad_member_role;
begin
  select role into v_their_role from public.advertiser_members where account_id = p_account and user_id = p_user;
  if v_their_role is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_their_role = 'owner' then
    raise exception 'The owner cannot be removed' using errcode = '42501';
  end if;
  -- Anyone may leave; otherwise owners remove anyone, admins remove editors and analysts.
  if p_user <> v_me and not (
    v_my_role = 'owner' or (v_my_role = 'admin' and v_their_role in ('editor', 'analyst'))
  ) then
    raise exception 'You cannot remove this member' using errcode = '42501';
  end if;
  delete from public.advertiser_members where account_id = p_account and user_id = p_user;
  perform public.write_audit('ad_account.member_removed', 'advertiser_account', p_account::text, jsonb_build_object('user', p_user));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Campaigns: new-style ("managed") campaigns keep creative content on ads, not on the campaign
-- ---------------------------------------------------------------------------------------------
alter table public.ad_campaigns
  add column structure text not null default 'legacy' check (structure in ('legacy', 'managed')),
  add column budget_type text not null default 'daily' check (budget_type in ('daily', 'lifetime')),
  add column spend_cap_minor bigint check (spend_cap_minor is null or spend_cap_minor > 0),
  add column special_category text not null default 'none'
    check (special_category in ('none', 'employment', 'housing', 'credit', 'financial_products')),
  add column archived_at timestamptz,
  -- Trusted: set only by staff (suspend_ad_campaign). Suspended campaigns never deliver.
  add column suspended_at timestamptz;

-- Legacy campaigns carry their creative inline; managed ones put it on ads.
alter table public.ad_campaigns alter column headline drop not null;
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.ad_campaigns'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%destination_url IS NOT NULL%listing_id IS NOT NULL%'
  loop
    execute format('alter table public.ad_campaigns drop constraint %I', r.conname);
  end loop;
end;
$$;
alter table public.ad_campaigns add constraint ad_campaigns_legacy_creative check (
  structure = 'managed' or (headline is not null and (destination_url is not null or listing_id is not null))
);

create index ad_campaigns_live_idx on public.ad_campaigns (advertiser_account_id)
  where status = 'active' and archived_at is null and suspended_at is null;

grant insert (structure, budget_type, spend_cap_minor, special_category) on public.ad_campaigns to authenticated;
grant update (budget_type, spend_cap_minor, special_category) on public.ad_campaigns to authenticated;

-- Team access to campaigns (the original owner-only policies remain for legacy campaigns).
create policy "ad account members read campaigns" on public.ad_campaigns
  for select to authenticated using (public.can_read_ad_account(advertiser_account_id));
create policy "ad account editors create managed campaigns" on public.ad_campaigns
  for insert to authenticated
  with check (
    structure = 'managed' and status = 'draft' and owner_id = (select auth.uid())
    and public.can_access_ad_account(advertiser_account_id, 'editor')
    and exists (select 1 from public.advertiser_accounts a
                where a.id = advertiser_account_id and a.status = 'active' and a.currency = ad_campaigns.currency)
  );
create policy "ad account editors edit draft managed campaigns" on public.ad_campaigns
  for update to authenticated
  using (structure = 'managed' and status in ('draft', 'rejected') and public.can_access_ad_account(advertiser_account_id, 'editor'))
  with check (structure = 'managed' and public.can_access_ad_account(advertiser_account_id, 'editor'));
create policy "ad account editors delete draft managed campaigns" on public.ad_campaigns
  for delete to authenticated
  using (structure = 'managed' and status in ('draft', 'rejected') and public.can_access_ad_account(advertiser_account_id, 'editor'));

-- ---------------------------------------------------------------------------------------------
-- Targeting: an allow-list of non-sensitive keys. Anything else (age, gender, religion, health,
-- ethnicity, sexuality, politics, ...) is rejected outright.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_targeting_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  item jsonb;
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('countries', 'regions', 'cities', 'industries', 'member_types', 'job_titles', 'business_types',
                 'interests', 'languages', 'include_audience_ids', 'exclude_audience_ids') then
      return false;
    end if;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 50 then
      return false;
    end if;
    -- No member profile carries a language yet, so language targeting can't be honoured.
    if k = 'languages' and jsonb_array_length(v) > 0 then
      return false;
    end if;
    for item in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') not between 1 and 80 then
        return false;
      end if;
      if k in ('include_audience_ids', 'exclude_audience_ids')
         and (item #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create or replace function public.ad_targeting_is_empty(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or not exists (select 1 from jsonb_each(p) e where jsonb_array_length(e.value) > 0);
$$;

-- ---------------------------------------------------------------------------------------------
-- Ad sets
-- ---------------------------------------------------------------------------------------------
create table public.ad_sets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  status public.ad_entity_status not null default 'draft',
  placements text[] not null check (
    cardinality(placements) between 1 and 7
    and placements <@ array['feed', 'stories', 'discover', 'marketplace', 'events', 'business', 'recommendations']
  ),
  targeting jsonb not null default '{}' check (public.ad_targeting_valid(targeting)),
  bid_strategy text not null default 'lowest_cost' check (bid_strategy in ('lowest_cost', 'cpm_cap', 'cpc_cap', 'cpa_target')),
  bid_minor bigint check (bid_minor is null or bid_minor > 0),
  daily_budget_minor bigint check (daily_budget_minor is null or daily_budget_minor > 0),
  frequency_cap_per_day smallint not null default 3 check (frequency_cap_per_day between 1 and 20),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (bid_strategy = 'lowest_cost' or bid_minor is not null)
);
create index ad_sets_campaign_idx on public.ad_sets (campaign_id);
create index ad_sets_account_idx on public.ad_sets (account_id);
create trigger ad_sets_set_updated_at before update on public.ad_sets
  for each row execute function public.set_updated_at();

-- account_id always follows the campaign (clients can't point an ad set at another account).
create or replace function public.ad_sets_fill_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.advertiser_account_id into new.account_id from public.ad_campaigns c where c.id = new.campaign_id;
  if new.account_id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger ad_sets_fill_account before insert or update of campaign_id on public.ad_sets
  for each row execute function public.ad_sets_fill_account();

alter table public.ad_sets enable row level security;
revoke all on public.ad_sets from anon, authenticated;
grant select, delete on public.ad_sets to authenticated;
grant insert (campaign_id, name, status, placements, targeting, bid_strategy, bid_minor, daily_budget_minor,
  frequency_cap_per_day, starts_at, ends_at) on public.ad_sets to authenticated;
grant update (name, status, placements, targeting, bid_strategy, bid_minor, daily_budget_minor,
  frequency_cap_per_day, starts_at, ends_at) on public.ad_sets to authenticated;
create policy "ad account members read ad sets" on public.ad_sets
  for select to authenticated using (public.can_read_ad_account(account_id));
create policy "ad account editors create ad sets" on public.ad_sets
  for insert to authenticated
  with check (
    public.can_access_ad_account(account_id, 'editor')
    and exists (select 1 from public.ad_campaigns c where c.id = campaign_id and c.structure = 'managed'
      and c.archived_at is null and c.suspended_at is null)
  );
create policy "ad account editors edit ad sets" on public.ad_sets
  for update to authenticated
  using (public.can_access_ad_account(account_id, 'editor'))
  with check (public.can_access_ad_account(account_id, 'editor'));
create policy "ad account editors delete draft ad sets" on public.ad_sets
  for delete to authenticated
  using (status = 'draft' and public.can_access_ad_account(account_id, 'editor'));

-- ---------------------------------------------------------------------------------------------
-- Creatives (reusable across ads) and the private ad-media bucket
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_media_valid(p jsonb, p_format text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  n int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    return false;
  end if;
  n := jsonb_array_length(p);
  if n > 10 then
    return false;
  end if;
  if p_format = 'carousel' and n not between 2 and 10 then
    return false;
  end if;
  -- single_image allows 0 media for text/listing ads (incl. migrated legacy ads); the app requires one.
  if (p_format = 'video' and n <> 1) or (p_format = 'single_image' and n > 1) then
    return false;
  end if;
  for item in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item->>'path', '') !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'
       or (item->>'path') like '%..%'
       or coalesce(item->>'kind', '') not in ('image', 'video')
       or (p_format = 'video' and item->>'kind' <> 'video')
       or (p_format in ('single_image', 'carousel') and item->>'kind' <> 'image') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  format text not null check (format in ('single_image', 'video', 'carousel', 'sponsored_post', 'business_card', 'event', 'lead_form')),
  primary_text text check (char_length(primary_text) <= 500),
  headline text check (char_length(headline) <= 90),
  description text check (char_length(description) <= 200),
  cta text not null default 'learn_more' check (cta in ('learn_more', 'shop_now', 'book_now', 'contact_us', 'sign_up',
    'apply_now', 'register', 'get_quote', 'download')),
  destination_url text check (destination_url is null or (destination_url ~ '^https://[^[:space:]]+$' and char_length(destination_url) <= 2000)),
  url_params text check (url_params is null or (char_length(url_params) <= 500
    and url_params ~ '^[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~%+-]*(&[A-Za-z0-9_.~-]+=[A-Za-z0-9_.~%+-]*){0,19}$')),
  media jsonb not null default '[]',
  post_id uuid references public.posts (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  business_id uuid references public.businesses (id) on delete set null,
  -- Trusted: moderation outcome.
  review_status public.ad_review_status not null default 'pending',
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.ad_media_valid(media, format)),
  check (format <> 'sponsored_post' or post_id is not null),
  check (format <> 'business_card' or business_id is not null),
  check (format <> 'event' or event_id is not null),
  -- Every ad needs somewhere to send people.
  check (destination_url is not null or post_id is not null or listing_id is not null or event_id is not null or business_id is not null),
  check (format = 'sponsored_post' or headline is not null)
);
create index ad_creatives_account_idx on public.ad_creatives (account_id, created_at desc);
create index ad_creatives_post_idx on public.ad_creatives (post_id);
create index ad_creatives_listing_idx on public.ad_creatives (listing_id);
create index ad_creatives_event_idx on public.ad_creatives (event_id);
create index ad_creatives_business_idx on public.ad_creatives (business_id);
create trigger ad_creatives_set_updated_at before update on public.ad_creatives
  for each row execute function public.set_updated_at();

alter table public.ad_creatives enable row level security;
revoke all on public.ad_creatives from anon, authenticated;
grant select, delete on public.ad_creatives to authenticated;
grant insert (account_id, name, format, primary_text, headline, description, cta, destination_url, url_params, media,
  post_id, listing_id, event_id, business_id) on public.ad_creatives to authenticated;
grant update (name, format, primary_text, headline, description, cta, destination_url, url_params, media,
  post_id, listing_id, event_id, business_id) on public.ad_creatives to authenticated;
create policy "ad account members read creatives" on public.ad_creatives
  for select to authenticated using (public.can_read_ad_account(account_id));
-- Promoted content must belong to the person creating the ad: their own post, or a listing, event
-- or business they run.
create policy "ad account editors create creatives" on public.ad_creatives
  for insert to authenticated
  with check (
    public.can_access_ad_account(account_id, 'editor') and review_status = 'pending'
    and (post_id is null or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id)))
    and (business_id is null or public.is_business_owner(business_id))
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid())))
  );
create policy "ad account editors edit creatives" on public.ad_creatives
  for update to authenticated
  using (public.can_access_ad_account(account_id, 'editor'))
  with check (
    public.can_access_ad_account(account_id, 'editor')
    and (post_id is null or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
    and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id)))
    and (business_id is null or public.is_business_owner(business_id))
    and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.host_id = (select auth.uid())))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'ad-media', 'ad-media', false, 104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
) on conflict (id) do nothing;

-- Path: <account_id>/<file>. Editors upload; members and staff read. Delivered ads are signed
-- server-side, so viewers never need direct bucket access.
create or replace function public.ad_media_path_allowed(p_name text, p_min public.ad_member_role)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_account uuid;
begin
  if (select auth.uid()) is null or array_length(v_parts, 1) <> 2 or p_name like '%..%' then
    return false;
  end if;
  begin
    v_account := v_parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.can_access_ad_account(v_account, p_min) or (p_min = 'analyst' and public.is_staff('moderator'));
end;
$$;
revoke execute on function public.ad_media_path_allowed(text, public.ad_member_role) from public, anon;
grant execute on function public.ad_media_path_allowed(text, public.ad_member_role) to authenticated;

create policy "ad media: editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-media' and public.ad_media_path_allowed(name, 'editor'));
create policy "ad media: members and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'ad-media' and public.ad_media_path_allowed(name, 'analyst'));
create policy "ad media: editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ad-media' and public.ad_media_path_allowed(name, 'editor'));

-- ---------------------------------------------------------------------------------------------
-- Ads
-- ---------------------------------------------------------------------------------------------
create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  ad_set_id uuid not null references public.ad_sets (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  creative_id uuid not null references public.ad_creatives (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  status public.ad_entity_status not null default 'draft',
  -- Trusted: moderation outcome.
  review_status public.ad_review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index advertisements_ad_set_idx on public.advertisements (ad_set_id);
create index advertisements_campaign_idx on public.advertisements (campaign_id);
create index advertisements_account_idx on public.advertisements (account_id);
create index advertisements_creative_idx on public.advertisements (creative_id);
create index advertisements_serving_idx on public.advertisements (ad_set_id) where status = 'active' and review_status = 'approved';
create trigger advertisements_set_updated_at before update on public.advertisements
  for each row execute function public.set_updated_at();

-- Changing an approved creative's content sends it (and every ad using it) back to review, so an
-- unreviewed message can never ride on an earlier approval.
create or replace function public.ad_creatives_rereview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.review_status in ('approved', 'rejected', 'changes_requested')
     and new.review_status = old.review_status
     and (new.primary_text, new.headline, new.description, new.cta, new.destination_url, new.url_params, new.media,
          new.post_id, new.listing_id, new.event_id, new.business_id, new.format)
         is distinct from
         (old.primary_text, old.headline, old.description, old.cta, old.destination_url, old.url_params, old.media,
          old.post_id, old.listing_id, old.event_id, old.business_id, old.format) then
    new.review_status := 'pending';
    new.review_note := null;
    update public.advertisements set review_status = 'pending'
      where creative_id = new.id and review_status in ('approved', 'rejected', 'changes_requested');
  end if;
  return new;
end;
$$;
create trigger ad_creatives_rereview before update on public.ad_creatives
  for each row execute function public.ad_creatives_rereview();

create policy "ad account editors delete unused creatives" on public.ad_creatives
  for delete to authenticated
  using (public.can_access_ad_account(account_id, 'editor')
    and not exists (select 1 from public.advertisements a where a.creative_id = ad_creatives.id));

-- campaign_id/account_id follow the ad set; the creative must belong to the same account.
create or replace function public.advertisements_fill_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.campaign_id, s.account_id into new.campaign_id, new.account_id from public.ad_sets s where s.id = new.ad_set_id;
  if new.account_id is null then
    raise exception 'ad set not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.ad_creatives c where c.id = new.creative_id and c.account_id = new.account_id) then
    raise exception 'creative not found on this account' using errcode = 'P0002';
  end if;
  -- Swapping the creative of a reviewed ad needs a fresh review.
  if tg_op = 'UPDATE' and new.creative_id is distinct from old.creative_id and new.review_status = old.review_status
     and old.review_status in ('approved', 'rejected', 'changes_requested') then
    new.review_status := 'pending';
  end if;
  return new;
end;
$$;
create trigger advertisements_fill_refs before insert or update of ad_set_id, creative_id on public.advertisements
  for each row execute function public.advertisements_fill_refs();

alter table public.advertisements enable row level security;
revoke all on public.advertisements from anon, authenticated;
grant select, delete on public.advertisements to authenticated;
grant insert (ad_set_id, creative_id, name, status) on public.advertisements to authenticated;
grant update (creative_id, name, status) on public.advertisements to authenticated;
create policy "ad account members read ads" on public.advertisements
  for select to authenticated using (public.can_read_ad_account(account_id));
create policy "ad account editors create ads" on public.advertisements
  for insert to authenticated
  with check (public.can_access_ad_account(account_id, 'editor') and review_status = 'draft');
create policy "ad account editors edit ads" on public.advertisements
  for update to authenticated
  using (public.can_access_ad_account(account_id, 'editor'))
  with check (public.can_access_ad_account(account_id, 'editor'));
create policy "ad account editors delete draft ads" on public.advertisements
  for delete to authenticated
  using (review_status = 'draft' and public.can_access_ad_account(account_id, 'editor'));

-- ---------------------------------------------------------------------------------------------
-- Reviews and appeals (written only by the functions below)
-- ---------------------------------------------------------------------------------------------
create table public.ad_reviews (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('campaign', 'ad', 'creative', 'account')),
  entity_id uuid not null,
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested', 'suspended', 'reinstated')),
  reasons text[] not null default '{}' check (cardinality(reasons) <= 10),
  note text check (char_length(note) <= 2000),
  reviewer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ad_reviews_account_idx on public.ad_reviews (account_id, created_at desc);
create index ad_reviews_entity_idx on public.ad_reviews (entity_type, entity_id);
create index ad_reviews_reviewer_idx on public.ad_reviews (reviewer_id);

create table public.ad_appeals (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.ad_reviews (id) on delete cascade,
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  submitted_by uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index ad_appeals_one_open on public.ad_appeals (review_id) where status = 'open';
create index ad_appeals_account_idx on public.ad_appeals (account_id, created_at desc);
create index ad_appeals_open_idx on public.ad_appeals (created_at) where status = 'open';
create index ad_appeals_submitted_by_idx on public.ad_appeals (submitted_by);
create index ad_appeals_resolved_by_idx on public.ad_appeals (resolved_by);

alter table public.ad_reviews enable row level security;
alter table public.ad_appeals enable row level security;
revoke all on public.ad_reviews, public.ad_appeals from anon, authenticated;
grant select on public.ad_reviews, public.ad_appeals to authenticated;
create policy "ad account members read reviews" on public.ad_reviews
  for select to authenticated using (public.can_read_ad_account(account_id));
create policy "ad account members read appeals" on public.ad_appeals
  for select to authenticated using (public.can_read_ad_account(account_id));

-- ---------------------------------------------------------------------------------------------
-- Audiences (versioned). Customer-list and website audiences need an external integration and
-- match nobody until it exists; nothing here reads uploaded personal data.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_audience_definition_valid(p_kind text, p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  if p_kind in ('saved', 'exclusion') then
    return public.ad_targeting_valid(p)
      and coalesce(jsonb_array_length(p->'include_audience_ids'), 0) = 0
      and coalesce(jsonb_array_length(p->'exclude_audience_ids'), 0) = 0;
  elsif p_kind = 'engagement' then
    return (select count(*) from jsonb_object_keys(p) k where k not in ('source', 'days')) = 0
      and coalesce(p->>'source', '') in ('page_visitors', 'ad_engagers')
      and jsonb_typeof(p->'days') = 'number'
      and (p->>'days')::numeric between 1 and 365;
  elsif p_kind in ('customer_list', 'website') then
    return p = '{"requires_integration": true}'::jsonb;
  end if;
  return false;
end;
$$;

create table public.ad_audiences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('saved', 'engagement', 'exclusion', 'customer_list', 'website')),
  definition jsonb not null default '{}',
  -- Trusted: maintained by the versioning trigger.
  version int not null default 1,
  previous_versions jsonb[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.ad_audience_definition_valid(kind, definition))
);
create index ad_audiences_account_idx on public.ad_audiences (account_id);
create trigger ad_audiences_set_updated_at before update on public.ad_audiences
  for each row execute function public.set_updated_at();

create or replace function public.ad_audiences_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.definition is distinct from old.definition or new.kind is distinct from old.kind then
    new.version := old.version + 1;
    new.previous_versions := (array_append(old.previous_versions,
      jsonb_build_object('version', old.version, 'kind', old.kind, 'definition', old.definition, 'replaced_at', now())))[greatest(1, cardinality(old.previous_versions) - 18):];
  else
    new.version := old.version;
    new.previous_versions := old.previous_versions;
  end if;
  return new;
end;
$$;
create trigger ad_audiences_version before update on public.ad_audiences
  for each row execute function public.ad_audiences_version();

alter table public.ad_audiences enable row level security;
revoke all on public.ad_audiences from anon, authenticated;
grant select, delete on public.ad_audiences to authenticated;
grant insert (account_id, name, kind, definition) on public.ad_audiences to authenticated;
grant update (name, kind, definition) on public.ad_audiences to authenticated;
create policy "ad account members read audiences" on public.ad_audiences
  for select to authenticated using (public.can_read_ad_account(account_id));
create policy "ad account editors create audiences" on public.ad_audiences
  for insert to authenticated with check (public.can_access_ad_account(account_id, 'editor') and version = 1);
create policy "ad account editors edit audiences" on public.ad_audiences
  for update to authenticated
  using (public.can_access_ad_account(account_id, 'editor'))
  with check (public.can_access_ad_account(account_id, 'editor'));
create policy "ad account editors delete audiences" on public.ad_audiences
  for delete to authenticated using (public.can_access_ad_account(account_id, 'editor'));

-- Audiences referenced by an ad set must belong to the same account.
create or replace function public.ad_sets_check_audiences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  for v_id in
    select jsonb_array_elements_text(coalesce(new.targeting->'include_audience_ids', '[]'))
    union all
    select jsonb_array_elements_text(coalesce(new.targeting->'exclude_audience_ids', '[]'))
  loop
    if not exists (select 1 from public.ad_audiences a where a.id = v_id::uuid and a.account_id = new.account_id) then
      raise exception 'audience % is not on this account', v_id using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;
create trigger ad_sets_check_audiences before insert or update of targeting, campaign_id on public.ad_sets
  for each row execute function public.ad_sets_check_audiences();

-- Members can opt out of personalised ads; they then see only untargeted ads.
alter table public.profiles add column ads_personalization boolean not null default true;
grant update (ads_personalization) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Delivery events: link to the new hierarchy
-- ---------------------------------------------------------------------------------------------
alter table public.ad_events
  add column account_id uuid references public.advertiser_accounts (id) on delete cascade,
  add column ad_set_id uuid references public.ad_sets (id) on delete set null,
  add column ad_id uuid references public.advertisements (id) on delete set null,
  add column creative_id uuid references public.ad_creatives (id) on delete set null,
  add column dedupe_key text unique check (dedupe_key is null or char_length(dedupe_key) <= 200);

update public.ad_events e set account_id = c.advertiser_account_id from public.ad_campaigns c where c.id = e.campaign_id;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.ad_events'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%placement%'
  loop
    execute format('alter table public.ad_events drop constraint %I', r.conname);
  end loop;
end;
$$;
alter table public.ad_events add constraint ad_events_placement_check check (placement in
  ('feed', 'stories', 'discover', 'marketplace', 'events', 'business', 'recommendations', 'luxury'));

create index ad_events_account_idx on public.ad_events (account_id, occurred_at);
create index ad_events_ad_set_idx on public.ad_events (ad_set_id, occurred_at);
create index ad_events_ad_idx on public.ad_events (ad_id, occurred_at);
create index ad_events_creative_idx on public.ad_events (creative_id);
create index ad_events_viewer_ad_set_idx on public.ad_events (viewer_id, ad_set_id, occurred_at) where event_type = 'impression';

create policy "ad account members read events" on public.ad_events
  for select to authenticated using (account_id is not null and public.can_read_ad_account(account_id));

-- ---------------------------------------------------------------------------------------------
-- Targeting evaluation (internal; never exposed to clients)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_text_list(p jsonb, k text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(select lower(trim(x)) from jsonb_array_elements_text(coalesce(p->k, '[]')) x where trim(x) <> ''), '{}');
$$;

create or replace function public.ad_profile_matches(p jsonb, v public.profiles)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_loc text := lower(coalesce(v.location, ''));
  v_list text[];
  k text;
begin
  foreach k in array array['countries', 'regions', 'cities'] loop
    v_list := public.ad_text_list(p, k);
    if cardinality(v_list) > 0 and not exists (select 1 from unnest(v_list) x where v_loc like '%' || x || '%') then
      return false;
    end if;
  end loop;
  v_list := public.ad_text_list(p, 'industries');
  if cardinality(v_list) > 0 and not (lower(coalesce(v.industry, '')) = any(v_list)) then
    return false;
  end if;
  v_list := public.ad_text_list(p, 'member_types');
  if cardinality(v_list) > 0 and not (coalesce(v.member_type::text, '') = any(v_list)) then
    return false;
  end if;
  v_list := public.ad_text_list(p, 'job_titles');
  if cardinality(v_list) > 0 and not exists (select 1 from unnest(v_list) x where lower(coalesce(v.job_title, '')) like '%' || x || '%') then
    return false;
  end if;
  v_list := public.ad_text_list(p, 'business_types');
  if cardinality(v_list) > 0 and not exists (
    select 1 from public.businesses b where b.owner_id = v.id and b.status = 'approved' and b.category::text = any(v_list)
  ) then
    return false;
  end if;
  v_list := public.ad_text_list(p, 'interests');
  if cardinality(v_list) > 0 and not exists (select 1 from unnest(v.interests) i where lower(i) = any(v_list)) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.ad_audience_contains(p_audience uuid, p_account uuid, v public.profiles)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.ad_audiences;
  v_owner uuid;
begin
  select * into a from public.ad_audiences where id = p_audience and account_id = p_account;
  if not found then
    return false;
  end if;
  if a.kind in ('saved', 'exclusion') then
    return public.ad_profile_matches(a.definition, v);
  elsif a.kind = 'engagement' then
    if a.definition->>'source' = 'ad_engagers' then
      return exists (select 1 from public.ad_events e
        where e.account_id = p_account and e.viewer_id = v.id and e.event_type = 'click'
          and e.occurred_at > now() - make_interval(days => (a.definition->>'days')::int));
    else
      select owner_id into v_owner from public.advertiser_accounts where id = p_account;
      return exists (select 1 from public.profile_views pv
        where pv.profile_id = v_owner and pv.viewer_id = v.id
          and pv.viewed_on > current_date - (a.definition->>'days')::int);
    end if;
  end if;
  -- customer_list / website: needs an integration that doesn't exist yet.
  return false;
end;
$$;

create or replace function public.ad_targeting_matches(p jsonb, p_account uuid, v public.profiles)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids text[];
begin
  if public.ad_targeting_is_empty(p) then
    return true;
  end if;
  if not v.ads_personalization then
    return false;
  end if;
  if not public.ad_profile_matches(p, v) then
    return false;
  end if;
  v_ids := array(select jsonb_array_elements_text(coalesce(p->'include_audience_ids', '[]')));
  if cardinality(v_ids) > 0 and not exists (select 1 from unnest(v_ids) i where public.ad_audience_contains(i::uuid, p_account, v)) then
    return false;
  end if;
  v_ids := array(select jsonb_array_elements_text(coalesce(p->'exclude_audience_ids', '[]')));
  if exists (select 1 from unnest(v_ids) i where public.ad_audience_contains(i::uuid, p_account, v)) then
    return false;
  end if;
  return true;
end;
$$;

-- Audience size for a targeting spec: counts only, rounded to 2 significant figures, and NULL
-- below 100 so small groups of members can't be singled out.
create or replace function public.estimate_audience(p_targeting jsonb, p_account uuid default null)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to estimate audiences' using errcode = '42501';
  end if;
  if p_account is not null and not public.can_read_ad_account(p_account) then
    raise exception 'Not authorised for this account' using errcode = '42501';
  end if;
  if p_account is null and not public.is_staff('moderator')
     and not exists (select 1 from public.advertiser_members m where m.user_id = (select auth.uid())) then
    raise exception 'An advertiser account is required' using errcode = '42501';
  end if;
  if not public.ad_targeting_valid(p_targeting) then
    raise exception 'Invalid targeting' using errcode = '22023';
  end if;
  if p_account is null and (coalesce(jsonb_array_length(p_targeting->'include_audience_ids'), 0) > 0
     or coalesce(jsonb_array_length(p_targeting->'exclude_audience_ids'), 0) > 0) then
    raise exception 'Audience references need an account' using errcode = '22023';
  end if;
  select count(*) into v_n from public.profiles p
  where p.account_status = 'active' and p.onboarding_completed_at is not null
    and public.ad_targeting_matches(coalesce(p_targeting, '{}'), p_account, p);
  if v_n < 100 then
    return null;
  end if;
  return round(v_n, -(floor(log(v_n))::int - 1))::bigint;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Spend accounting (milli-minor units, read from measured events)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_spend_milli(p_scope text, p_id uuid, p_day date default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.cost_milli), 0)::bigint
  from public.ad_events e
  where case p_scope
          when 'campaign' then e.campaign_id = p_id
          when 'ad_set' then e.ad_set_id = p_id
          when 'account' then e.account_id = p_id
        end
    and (p_day is null or (e.occurred_at >= p_day::timestamptz and e.occurred_at < (p_day + 1)::timestamptz));
$$;

-- Appends tracking parameters and the ELVORA click id to a destination URL.
create or replace function public.ad_build_url(p_url text, p_params text, p_click_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_url is null then null else
    p_url || case when p_url like '%?%' then '&' else '?' end
      || coalesce(nullif(p_params, '') || '&', '') || 'elv_cid=' || p_click_id::text
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Delivery engine
-- ---------------------------------------------------------------------------------------------
-- Selects and records sponsored placements for the signed-in viewer. Only approved ads in
-- active, in-schedule, in-budget, funded campaigns that match targeting and the viewer's
-- frequency caps are eligible; every returned row is a measured impression.
create or replace function public.serve_ads_v2(p_placement text, p_limit integer default 1)
returns table (
  impression_id uuid,
  ad_id uuid,
  campaign_id uuid,
  format text,
  primary_text text,
  headline text,
  description text,
  cta text,
  destination_url text,
  media jsonb,
  post_id uuid,
  listing_id uuid,
  event_id uuid,
  business_id uuid,
  advertiser_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := (select auth.uid());
  v_profile public.profiles;
  v_place text;
  r record;
  v_imp uuid;
  v_served int := 0;
  v_cost bigint;
  v_balance bigint;
  v_today date := current_date;
begin
  if v_viewer is null or not public.is_active_member(v_viewer) then
    return;
  end if;
  if p_placement not in ('feed', 'stories', 'discover', 'marketplace', 'events', 'business', 'recommendations', 'luxury') then
    raise exception 'invalid placement' using errcode = 'P0001';
  end if;
  v_place := case when p_placement = 'luxury' then 'marketplace' else p_placement end;
  select * into v_profile from public.profiles where id = v_viewer;

  for r in
    with managed as (
      select 'managed'::text as path, ad.id as ad_id, s.id as ad_set_id, c.id as campaign_id, cr.id as creative_id,
        a.id as account_id, a.display_name as account_name, a.billing_mode, a.spend_limit_minor,
        cr.format, cr.primary_text, cr.headline, cr.description, cr.cta, cr.destination_url, cr.url_params, cr.media,
        cr.post_id, cr.listing_id, cr.event_id, cr.business_id,
        s.bid_strategy, s.bid_minor, s.daily_budget_minor as set_daily, s.frequency_cap_per_day as cap,
        c.objective, c.budget_type, c.daily_budget_minor, c.total_budget_minor, c.spend_cap_minor, c.cpm_minor, c.cpc_minor,
        -- Effective value per 1,000 impressions, for ranking (CPC assumes a 1% click-through prior).
        (case s.bid_strategy
           when 'cpm_cap' then s.bid_minor
           when 'cpc_cap' then s.bid_minor * 10
           else c.cpm_minor end)::numeric * (0.85 + random() * 0.3) as score
      from public.advertisements ad
      join public.ad_sets s on s.id = ad.ad_set_id
      join public.ad_campaigns c on c.id = ad.campaign_id
      join public.ad_creatives cr on cr.id = ad.creative_id
      join public.advertiser_accounts a on a.id = ad.account_id
      join public.profiles o on o.id = a.owner_id and o.account_status = 'active'
      where ad.status = 'active' and ad.review_status = 'approved' and cr.review_status = 'approved'
        and s.status = 'active' and c.status = 'active' and c.structure = 'managed'
        and c.archived_at is null and c.suspended_at is null
        and a.status = 'active' and a.billing_status = 'ok'
        and c.cpm_minor is not null
        and v_today between c.starts_on and c.ends_on
        and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at > now())
        and v_place = any(s.placements)
        -- Bids below the rate-card floor don't serve.
        and (s.bid_strategy <> 'cpm_cap' or s.bid_minor >= c.cpm_minor)
        and (s.bid_strategy <> 'cpc_cap' or s.bid_minor >= coalesce(c.cpc_minor, 0))
        and not exists (select 1 from public.advertiser_members m where m.account_id = a.id and m.user_id = v_viewer)
        and not public.is_blocked_between(v_viewer, a.owner_id)
        and public.ad_targeting_matches(s.targeting, a.id, v_profile)
    ),
    legacy as (
      select 'legacy'::text, null::uuid, null::uuid, c.id, null::uuid,
        a.id, a.display_name, a.billing_mode, null::bigint,
        'text'::text, c.body, c.headline, null::text, 'learn_more'::text, c.destination_url, null::text, '[]'::jsonb,
        null::uuid, c.listing_id, null::uuid, null::uuid,
        'lowest_cost'::text, null::bigint, null::bigint, c.frequency_cap_per_day,
        c.objective, 'daily'::text, c.daily_budget_minor, c.total_budget_minor, null::bigint, c.cpm_minor, c.cpc_minor,
        c.cpm_minor::numeric * (0.85 + random() * 0.3)
      from public.ad_campaigns c
      join public.advertiser_accounts a on a.id = c.advertiser_account_id and a.status = 'active'
      join public.profiles o on o.id = c.owner_id and o.account_status = 'active'
      where c.structure = 'legacy' and c.status = 'active' and c.archived_at is null and c.suspended_at is null
        and v_place in ('feed', 'discover', 'marketplace')
        and v_today between c.starts_on and c.ends_on
        and c.owner_id <> v_viewer
        and not public.is_blocked_between(v_viewer, c.owner_id)
        and (cardinality(c.target_locations) = 0 or exists (
          select 1 from unnest(c.target_locations) loc where v_profile.location ilike '%' || loc || '%'))
        and (cardinality(c.target_interests) = 0 or exists (
          select 1 from unnest(c.target_interests) i join unnest(v_profile.interests) vi on lower(vi) = lower(i)))
    )
    select * from managed union all select * from legacy
    order by score desc nulls last
    limit 20
  loop
    exit when v_served >= least(greatest(p_limit, 1), 3);

    -- Serialise spend checks per campaign and per account.
    perform 1 from public.ad_campaigns where id = r.campaign_id for update;
    perform 1 from public.advertiser_accounts where id = r.account_id for update;

    if r.path = 'legacy' then
      continue when (
        select count(*) from public.ad_events e
        where e.campaign_id = r.campaign_id and e.viewer_id = v_viewer and e.event_type = 'impression'
          and e.occurred_at > now() - interval '24 hours'
      ) >= r.cap;
      continue when public.campaign_spend_minor(r.campaign_id, v_today) + ceil(r.cpm_minor / 1000.0) > r.daily_budget_minor;
      continue when public.campaign_spend_minor(r.campaign_id) + ceil(r.cpm_minor / 1000.0) > r.total_budget_minor;
      v_cost := r.cpm_minor;
      -- Original-style campaigns on prepaid accounts draw down the balance too; the billing
      -- ledger refuses events it can't cover, so skip rather than fail the whole serve.
      if r.billing_mode = 'prepaid' then
        select a.balance_minor into v_balance from public.advertiser_accounts a where a.id = r.account_id;
        continue when v_balance * 1000 < v_cost or v_balance <= 0;
      end if;
    else
      continue when (
        select count(*) from public.ad_events e
        where e.ad_set_id = r.ad_set_id and e.viewer_id = v_viewer and e.event_type = 'impression'
          and e.occurred_at > now() - interval '24 hours'
      ) >= r.cap;
      -- CPC ad sets pay per click; impressions are free. Everything else pays the rate-card CPM.
      v_cost := case when r.bid_strategy = 'cpc_cap' then 0 else r.cpm_minor end;
      continue when r.set_daily is not null
        and public.ad_spend_milli('ad_set', r.ad_set_id, v_today) + v_cost > r.set_daily * 1000;
      continue when r.budget_type = 'daily'
        and public.ad_spend_milli('campaign', r.campaign_id, v_today) + v_cost > r.daily_budget_minor * 1000;
      continue when public.ad_spend_milli('campaign', r.campaign_id) + v_cost > r.total_budget_minor * 1000;
      continue when r.spend_cap_minor is not null
        and public.ad_spend_milli('campaign', r.campaign_id) + v_cost > r.spend_cap_minor * 1000;
      continue when r.spend_limit_minor is not null
        and public.ad_spend_milli('account', r.account_id) + v_cost > r.spend_limit_minor * 1000;
      if r.billing_mode = 'prepaid' then
        select a.balance_minor into v_balance from public.advertiser_accounts a where a.id = r.account_id;
        -- Must be able to pay for this impression (or, for CPC, at least one click).
        continue when v_balance * 1000 < greatest(v_cost, case when r.bid_strategy = 'cpc_cap' then coalesce(r.cpc_minor, 0) * 1000 else 0 end)
          or v_balance <= 0;
      end if;
    end if;

    insert into public.ad_events (campaign_id, account_id, ad_set_id, ad_id, creative_id, event_type, viewer_id, placement, cost_milli)
    values (r.campaign_id, r.account_id, r.ad_set_id, r.ad_id, r.creative_id, 'impression', v_viewer, v_place, v_cost)
    returning id into v_imp;

    impression_id := v_imp;
    ad_id := r.ad_id;
    campaign_id := r.campaign_id;
    format := r.format;
    primary_text := r.primary_text;
    headline := r.headline;
    description := r.description;
    cta := r.cta;
    destination_url := public.ad_build_url(r.destination_url, r.url_params, v_imp);
    media := r.media;
    post_id := r.post_id;
    listing_id := r.listing_id;
    event_id := r.event_id;
    business_id := r.business_id;
    advertiser_name := r.account_name;
    v_served := v_served + 1;
    return next;
  end loop;
end;
$$;

-- The original entry point (used by the sponsored slot) now serves through the same engine.
create or replace function public.serve_ads(p_placement text, p_limit integer default 1)
returns table (
  impression_id uuid,
  campaign_id uuid,
  headline text,
  body text,
  destination_url text,
  listing_id uuid,
  advertiser_name text
)
language sql
security definer
set search_path = ''
as $$
  select s.impression_id, s.campaign_id, coalesce(s.headline, left(s.primary_text, 90)), s.primary_text,
    s.destination_url, s.listing_id, s.advertiser_name
  from public.serve_ads_v2(p_placement, p_limit) s;
$$;

-- Record a click for an impression served to this viewer (once per impression, within 1 hour).
create or replace function public.record_ad_click_v2(p_impression uuid)
returns table (destination_url text, listing_id uuid, post_id uuid, event_id uuid, business_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.ad_events;
  v_c public.ad_campaigns;
  v_s public.ad_sets;
  v_cr public.ad_creatives;
  v_a public.advertiser_accounts;
  v_cost bigint := 0;
begin
  select * into v_imp from public.ad_events
  where id = p_impression and event_type = 'impression' and viewer_id = (select auth.uid())
    and occurred_at > now() - interval '1 hour';
  if v_imp.id is null then
    raise exception 'impression not found' using errcode = 'P0001';
  end if;
  select * into v_c from public.ad_campaigns where id = v_imp.campaign_id for update;
  select * into v_a from public.advertiser_accounts where id = v_imp.account_id for update;

  if v_imp.ad_id is null then
    -- Legacy campaigns: traffic objective pays per click while the total budget allows.
    if v_c.objective = 'traffic' and public.campaign_spend_minor(v_c.id) + coalesce(v_c.cpc_minor, 0) <= v_c.total_budget_minor
       and (v_a.billing_mode <> 'prepaid' or v_a.balance_minor * 1000 >= coalesce(v_c.cpc_minor, 0) * 1000) then
      v_cost := coalesce(v_c.cpc_minor, 0) * 1000;
    end if;
    destination_url := v_c.destination_url;
    listing_id := v_c.listing_id;
  else
    select * into v_s from public.ad_sets where id = v_imp.ad_set_id;
    select * into v_cr from public.ad_creatives where id = v_imp.creative_id;
    if v_s.bid_strategy = 'cpc_cap' then
      v_cost := coalesce(v_c.cpc_minor, 0) * 1000;
      -- Charge only within every budget and (for prepaid accounts) the available balance;
      -- otherwise the click is still recorded, at no cost.
      if (v_s.daily_budget_minor is not null and public.ad_spend_milli('ad_set', v_s.id, current_date) + v_cost > v_s.daily_budget_minor * 1000)
         or (v_c.budget_type = 'daily' and public.ad_spend_milli('campaign', v_c.id, current_date) + v_cost > v_c.daily_budget_minor * 1000)
         or public.ad_spend_milli('campaign', v_c.id) + v_cost > v_c.total_budget_minor * 1000
         or (v_c.spend_cap_minor is not null and public.ad_spend_milli('campaign', v_c.id) + v_cost > v_c.spend_cap_minor * 1000)
         or (v_a.spend_limit_minor is not null and public.ad_spend_milli('account', v_a.id) + v_cost > v_a.spend_limit_minor * 1000)
         or (v_a.billing_mode = 'prepaid' and v_a.balance_minor * 1000 < v_cost) then
        v_cost := 0;
      end if;
    end if;
    destination_url := public.ad_build_url(v_cr.destination_url, v_cr.url_params, v_imp.id);
    listing_id := v_cr.listing_id;
    post_id := v_cr.post_id;
    event_id := v_cr.event_id;
    business_id := v_cr.business_id;
  end if;

  insert into public.ad_events (campaign_id, account_id, ad_set_id, ad_id, creative_id, event_type, viewer_id, impression_id, placement, cost_milli)
  values (v_imp.campaign_id, v_imp.account_id, v_imp.ad_set_id, v_imp.ad_id, v_imp.creative_id, 'click', v_imp.viewer_id, v_imp.id, v_imp.placement, v_cost)
  on conflict do nothing;
  return next;
end;
$$;

create or replace function public.record_ad_click(p_impression uuid)
returns table (destination_url text, listing_id uuid)
language sql
security definer
set search_path = ''
as $$
  select c.destination_url, c.listing_id from public.record_ad_click_v2(p_impression) c;
$$;

-- ---------------------------------------------------------------------------------------------
-- Workflow: submission, review, appeals, state changes
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_notify_account(p_account uuid, p_entity_type text, p_entity uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.advertiser_accounts where id = p_account;
  perform public.notify(v_owner, 'campaign_update', null, p_entity_type, p_entity, p_payload);
end;
$$;

create or replace function public.submit_campaign_for_review(p_campaign uuid)
returns public.campaign_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.ad_campaigns;
  v_rate public.ad_rate_cards;
begin
  select * into v_c from public.ad_campaigns where id = p_campaign for update;
  if v_c.id is null or not public.can_access_ad_account(v_c.advertiser_account_id, 'editor') then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_c.structure <> 'managed' then
    raise exception 'use the original campaign flow for this campaign' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.advertiser_accounts a where a.id = v_c.advertiser_account_id and (a.status <> 'active' or a.billing_status = 'suspended')) then
    raise exception 'advertiser account is suspended' using errcode = '42501';
  end if;
  if v_c.status not in ('draft', 'rejected') or v_c.archived_at is not null or v_c.suspended_at is not null then
    raise exception 'only draft or rejected campaigns can be submitted' using errcode = 'P0001';
  end if;
  if v_c.ends_on < current_date then
    raise exception 'campaign end date is in the past' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.advertisements ad join public.ad_sets s on s.id = ad.ad_set_id
                 where ad.campaign_id = p_campaign and ad.status <> 'archived' and s.status <> 'archived') then
    raise exception 'add at least one ad set with an ad before submitting' using errcode = 'P0001';
  end if;
  select * into v_rate from public.ad_rate_cards r where r.currency = v_c.currency and r.objective = v_c.objective and r.active;
  if v_rate.currency is null then
    raise exception 'advertising for this objective is not yet available in %', v_c.currency using errcode = 'P0001';
  end if;

  update public.ad_campaigns
  set status = 'pending_review', review_note = null, cpm_minor = v_rate.cpm_minor, cpc_minor = v_rate.cpc_minor, submitted_at = now()
  where id = p_campaign;
  update public.ad_sets set status = 'active' where campaign_id = p_campaign and status = 'draft';
  update public.advertisements set status = case when status = 'draft' then 'active'::public.ad_entity_status else status end,
    review_status = 'pending'
  where campaign_id = p_campaign and status <> 'archived' and review_status in ('draft', 'rejected', 'changes_requested');
  update public.ad_creatives cr set review_status = 'pending', review_note = null
  where cr.review_status in ('rejected', 'changes_requested')
    and exists (select 1 from public.advertisements ad where ad.creative_id = cr.id and ad.campaign_id = p_campaign and ad.review_status = 'pending');
  perform public.write_audit('ad_campaign.submitted', 'ad_campaign', p_campaign::text, '{}');
  return 'pending_review';
end;
$$;

-- New ads added to a running campaign go through review on their own.
create or replace function public.submit_ad_for_review(p_ad uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad public.advertisements;
  v_status public.campaign_status;
begin
  select * into v_ad from public.advertisements where id = p_ad for update;
  if v_ad.id is null or not public.can_access_ad_account(v_ad.account_id, 'editor') then
    raise exception 'ad not found' using errcode = 'P0002';
  end if;
  select status into v_status from public.ad_campaigns where id = v_ad.campaign_id;
  if v_status in ('draft', 'rejected') then
    raise exception 'submit the campaign for review instead' using errcode = 'P0001';
  end if;
  if v_ad.review_status not in ('draft', 'rejected', 'changes_requested') then
    raise exception 'this ad is already in review or approved' using errcode = 'P0001';
  end if;
  update public.advertisements set review_status = 'pending', status = case when status = 'draft' then 'active'::public.ad_entity_status else status end
  where id = p_ad;
  update public.ad_creatives set review_status = 'pending', review_note = null
  where id = v_ad.creative_id and review_status in ('rejected', 'changes_requested');
end;
$$;

create or replace function public.review_ad_campaign(p_campaign uuid, p_decision text, p_reasons text[] default '{}', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.ad_campaigns;
  v_ad_status public.ad_review_status;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_decision <> 'approved' and cardinality(coalesce(p_reasons, '{}')) = 0 and coalesce(trim(p_note), '') = '' then
    raise exception 'give the advertiser a reason' using errcode = '22023';
  end if;
  select * into v_c from public.ad_campaigns where id = p_campaign for update;
  if v_c.id is null or v_c.structure <> 'managed' then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_c.status <> 'pending_review' then
    raise exception 'campaign is not awaiting review' using errcode = 'P0001';
  end if;
  v_ad_status := p_decision::public.ad_review_status;
  update public.ad_campaigns
  set status = case when p_decision = 'approved' then 'active'::public.campaign_status else 'rejected'::public.campaign_status end,
      reviewed_by = (select auth.uid()), review_note = left(coalesce(p_note, array_to_string(p_reasons, '; ')), 2000)
  where id = p_campaign;
  update public.advertisements set review_status = v_ad_status where campaign_id = p_campaign and review_status = 'pending';
  if p_decision = 'approved' then
    update public.ad_creatives cr set review_status = 'approved', review_note = null
    where cr.review_status = 'pending'
      and exists (select 1 from public.advertisements ad where ad.creative_id = cr.id and ad.campaign_id = p_campaign and ad.review_status = 'approved');
  end if;
  insert into public.ad_reviews (entity_type, entity_id, account_id, decision, reasons, note, reviewer_id)
  values ('campaign', p_campaign, v_c.advertiser_account_id, p_decision, coalesce(p_reasons, '{}'), p_note, (select auth.uid()));
  perform public.ad_notify_account(v_c.advertiser_account_id, 'ad_campaign', p_campaign, jsonb_build_object('status', p_decision));
  perform public.write_audit('ad_campaign.review.' || p_decision, 'ad_campaign', p_campaign::text,
    jsonb_build_object('reasons', p_reasons, 'note', p_note));
end;
$$;

create or replace function public.review_ad(p_ad uuid, p_decision text, p_reasons text[] default '{}', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad public.advertisements;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if p_decision <> 'approved' and cardinality(coalesce(p_reasons, '{}')) = 0 and coalesce(trim(p_note), '') = '' then
    raise exception 'give the advertiser a reason' using errcode = '22023';
  end if;
  select * into v_ad from public.advertisements where id = p_ad for update;
  if v_ad.id is null then
    raise exception 'ad not found' using errcode = 'P0002';
  end if;
  if v_ad.review_status <> 'pending' then
    raise exception 'ad is not awaiting review' using errcode = 'P0001';
  end if;
  update public.advertisements set review_status = p_decision::public.ad_review_status where id = p_ad;
  if p_decision = 'approved' then
    update public.ad_creatives set review_status = 'approved', review_note = null where id = v_ad.creative_id and review_status = 'pending';
  else
    update public.ad_creatives set review_note = left(coalesce(p_note, array_to_string(p_reasons, '; ')), 2000) where id = v_ad.creative_id;
  end if;
  insert into public.ad_reviews (entity_type, entity_id, account_id, decision, reasons, note, reviewer_id)
  values ('ad', p_ad, v_ad.account_id, p_decision, coalesce(p_reasons, '{}'), p_note, (select auth.uid()));
  perform public.ad_notify_account(v_ad.account_id, 'ad_campaign', v_ad.campaign_id, jsonb_build_object('status', p_decision, 'ad', p_ad));
  perform public.write_audit('ad.review.' || p_decision, 'advertisement', p_ad::text, jsonb_build_object('reasons', p_reasons, 'note', p_note));
end;
$$;

create or replace function public.set_ad_campaign_suspension(p_campaign uuid, p_suspend boolean, p_reasons text[] default '{}', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.ad_campaigns set suspended_at = case when p_suspend then now() else null end
  where id = p_campaign returning advertiser_account_id into v_account;
  if v_account is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  insert into public.ad_reviews (entity_type, entity_id, account_id, decision, reasons, note, reviewer_id)
  values ('campaign', p_campaign, v_account, case when p_suspend then 'suspended' else 'reinstated' end, coalesce(p_reasons, '{}'), p_note, (select auth.uid()));
  perform public.ad_notify_account(v_account, 'ad_campaign', p_campaign, jsonb_build_object('status', case when p_suspend then 'suspended' else 'reinstated' end));
  perform public.write_audit(case when p_suspend then 'ad_campaign.suspended' else 'ad_campaign.reinstated' end, 'ad_campaign', p_campaign::text,
    jsonb_build_object('reasons', p_reasons, 'note', p_note));
end;
$$;

create or replace function public.set_ad_account_suspension(p_account uuid, p_suspend boolean, p_reasons text[] default '{}', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.advertiser_accounts set status = case when p_suspend then 'suspended'::public.advertiser_status else 'active'::public.advertiser_status end
  where id = p_account;
  if not found then
    raise exception 'account not found' using errcode = 'P0002';
  end if;
  insert into public.ad_reviews (entity_type, entity_id, account_id, decision, reasons, note, reviewer_id)
  values ('account', p_account, p_account, case when p_suspend then 'suspended' else 'reinstated' end, coalesce(p_reasons, '{}'), p_note, (select auth.uid()));
  perform public.ad_notify_account(p_account, 'advertiser_account', p_account, jsonb_build_object('status', case when p_suspend then 'suspended' else 'reinstated' end));
  perform public.write_audit(case when p_suspend then 'ad_account.suspended' else 'ad_account.reinstated' end, 'advertiser_account', p_account::text,
    jsonb_build_object('reasons', p_reasons, 'note', p_note));
end;
$$;

create or replace function public.appeal_ad_review(p_review uuid, p_message text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.ad_reviews;
  v_id uuid;
begin
  select * into v_r from public.ad_reviews where id = p_review;
  if v_r.id is null or not public.can_access_ad_account(v_r.account_id, 'editor') then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if v_r.decision not in ('rejected', 'changes_requested', 'suspended') then
    raise exception 'only rejections and suspensions can be appealed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ad_appeals ap where ap.review_id = p_review and ap.status <> 'open') then
    raise exception 'this decision has already been appealed' using errcode = 'P0001';
  end if;
  insert into public.ad_appeals (review_id, account_id, message, submitted_by)
  values (p_review, v_r.account_id, trim(p_message), (select auth.uid()))
  returning id into v_id;
  perform public.write_audit('ad_review.appealed', 'ad_review', p_review::text, '{}');
  return v_id;
exception when unique_violation then
  raise exception 'an appeal is already open for this decision' using errcode = '23505';
end;
$$;

create or replace function public.resolve_ad_appeal(p_appeal uuid, p_overturn boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ap public.ad_appeals;
  v_r public.ad_reviews;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_ap from public.ad_appeals where id = p_appeal for update;
  if v_ap.id is null or v_ap.status <> 'open' then
    raise exception 'appeal not found' using errcode = 'P0002';
  end if;
  select * into v_r from public.ad_reviews where id = v_ap.review_id;
  if p_overturn then
    -- Overturning re-opens review (or lifts a suspension); it never approves anything unseen.
    if v_r.entity_type = 'account' then
      update public.advertiser_accounts set status = 'active' where id = v_r.entity_id;
    elsif v_r.entity_type = 'campaign' and v_r.decision = 'suspended' then
      update public.ad_campaigns set suspended_at = null where id = v_r.entity_id;
    elsif v_r.entity_type = 'campaign' then
      update public.ad_campaigns set status = 'pending_review' where id = v_r.entity_id and status = 'rejected';
      update public.advertisements set review_status = 'pending'
        where campaign_id = v_r.entity_id and review_status in ('rejected', 'changes_requested');
    elsif v_r.entity_type = 'ad' then
      update public.advertisements set review_status = 'pending' where id = v_r.entity_id and review_status in ('rejected', 'changes_requested');
    end if;
  end if;
  update public.ad_appeals
  set status = case when p_overturn then 'overturned' else 'upheld' end, resolved_by = (select auth.uid()),
      resolution_note = p_note, resolved_at = now()
  where id = p_appeal;
  perform public.ad_notify_account(v_ap.account_id, 'ad_appeal', p_appeal,
    jsonb_build_object('status', case when p_overturn then 'appeal_overturned' else 'appeal_upheld' end));
  perform public.write_audit(case when p_overturn then 'ad_appeal.overturned' else 'ad_appeal.upheld' end, 'ad_appeal', p_appeal::text,
    jsonb_build_object('note', p_note));
end;
$$;

-- Advertiser state changes for any campaign on the account (editors and up).
create or replace function public.set_ad_campaign_state(p_campaign uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.ad_campaigns;
begin
  select * into v_c from public.ad_campaigns where id = p_campaign for update;
  if v_c.id is null or not public.can_access_ad_account(v_c.advertiser_account_id, 'editor') then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if p_action = 'pause' and v_c.status = 'active' then
    update public.ad_campaigns set status = 'paused' where id = p_campaign;
  elsif p_action = 'resume' and v_c.status = 'paused' then
    if v_c.suspended_at is not null then
      raise exception 'this campaign has been suspended by ELVORA' using errcode = '42501';
    end if;
    if v_c.archived_at is not null then
      raise exception 'unarchive the campaign first' using errcode = 'P0001';
    end if;
    update public.ad_campaigns set status = 'active' where id = p_campaign;
  elsif p_action = 'archive' and v_c.archived_at is null and v_c.status <> 'pending_review' then
    update public.ad_campaigns set archived_at = now(),
      status = case when v_c.status = 'active' then 'paused'::public.campaign_status else v_c.status end
    where id = p_campaign;
  elsif p_action = 'unarchive' and v_c.archived_at is not null then
    update public.ad_campaigns set archived_at = null where id = p_campaign;
  else
    raise exception 'action % not allowed from status %', p_action, v_c.status using errcode = 'P0001';
  end if;
  perform public.write_audit('ad_campaign.' || p_action, 'ad_campaign', p_campaign::text, '{}');
end;
$$;

create or replace function public.duplicate_ad_campaign(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.ad_campaigns;
  v_new uuid;
  s record;
  v_new_set uuid;
begin
  select * into v_c from public.ad_campaigns where id = p_campaign;
  if v_c.id is null or not public.can_access_ad_account(v_c.advertiser_account_id, 'editor') then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_c.structure <> 'managed' then
    raise exception 'only Ads Manager campaigns can be duplicated' using errcode = 'P0001';
  end if;
  insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, status, currency, daily_budget_minor,
    total_budget_minor, starts_on, ends_on, structure, budget_type, spend_cap_minor, special_category, frequency_cap_per_day)
  values (v_c.advertiser_account_id, (select auth.uid()), left(v_c.name || ' (copy)', 120), v_c.objective, 'draft', v_c.currency,
    v_c.daily_budget_minor, v_c.total_budget_minor, greatest(v_c.starts_on, current_date), greatest(v_c.ends_on, current_date),
    'managed', v_c.budget_type, v_c.spend_cap_minor, v_c.special_category, v_c.frequency_cap_per_day)
  returning id into v_new;
  for s in select * from public.ad_sets where campaign_id = p_campaign and status <> 'archived' loop
    insert into public.ad_sets (campaign_id, name, status, placements, targeting, bid_strategy, bid_minor, daily_budget_minor,
      frequency_cap_per_day, starts_at, ends_at)
    values (v_new, s.name, 'draft', s.placements, s.targeting, s.bid_strategy, s.bid_minor, s.daily_budget_minor,
      s.frequency_cap_per_day, null, null)
    returning id into v_new_set;
    insert into public.advertisements (ad_set_id, creative_id, name, status)
    select v_new_set, ad.creative_id, ad.name, 'draft' from public.advertisements ad where ad.ad_set_id = s.id and ad.status <> 'archived';
  end loop;
  perform public.write_audit('ad_campaign.duplicated', 'ad_campaign', v_new::text, jsonb_build_object('from', p_campaign));
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Analytics: measured delivery only
-- ---------------------------------------------------------------------------------------------
create or replace function public.ad_metrics(
  p_account uuid, p_from date, p_to date, p_group text, p_campaign uuid default null
)
returns table (
  key text, label text, impressions bigint, reach bigint, clicks bigint, spend_minor bigint,
  conversions bigint, conversion_value_minor bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conv jsonb := '{}';
  v_key_expr text;
begin
  if not public.can_read_ad_account(p_account) then
    raise exception 'Not authorised for this account' using errcode = '42501';
  end if;
  if p_group not in ('day', 'campaign', 'ad_set', 'ad', 'placement') then
    raise exception 'invalid grouping' using errcode = '22023';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  -- Conversions come from the tracking module when it is installed (next migration).
  if to_regclass('public.ad_conversions') is not null and p_group <> 'placement' then
    v_key_expr := case p_group
      when 'day' then '((occurred_at at time zone ''UTC'')::date)::text'
      when 'campaign' then 'campaign_id::text'
      when 'ad_set' then 'ad_set_id::text'
      else 'ad_id::text' end;
    execute format(
      'select coalesce(jsonb_object_agg(k, jsonb_build_array(n, v)), ''{}'') from (
         select %s as k, count(*) as n, coalesce(sum(value_minor), 0) as v
         from public.ad_conversions
         where account_id = $1 and attributed and occurred_at >= $2::timestamptz and occurred_at < ($3 + 1)::timestamptz
           and ($4::uuid is null or campaign_id = $4)
         group by 1) s where k is not null', v_key_expr)
      into v_conv using p_account, p_from, p_to, p_campaign;
  end if;

  return query
  with ev as (
    select e.*,
      case p_group
        when 'day' then ((e.occurred_at at time zone 'UTC')::date)::text
        when 'campaign' then e.campaign_id::text
        when 'ad_set' then e.ad_set_id::text
        when 'ad' then e.ad_id::text
        else e.placement end as k
    from public.ad_events e
    where e.account_id = p_account
      and e.occurred_at >= p_from::timestamptz and e.occurred_at < (p_to + 1)::timestamptz
      and (p_campaign is null or e.campaign_id = p_campaign)
  ), agg as (
    select ev.k,
      count(*) filter (where ev.event_type = 'impression') as impressions,
      count(distinct ev.viewer_id) filter (where ev.event_type = 'impression') as reach,
      count(*) filter (where ev.event_type = 'click') as clicks,
      ceil(coalesce(sum(ev.cost_milli), 0) / 1000.0)::bigint as spend_minor
    from ev where ev.k is not null group by ev.k
  )
  select agg.k,
    case p_group
      when 'campaign' then (select c.name from public.ad_campaigns c where c.id::text = agg.k)
      when 'ad_set' then (select s.name from public.ad_sets s where s.id::text = agg.k)
      when 'ad' then (select ad.name from public.advertisements ad where ad.id::text = agg.k)
      else agg.k end,
    agg.impressions, agg.reach, agg.clicks, agg.spend_minor,
    coalesce((v_conv->agg.k->>0)::bigint, 0), coalesce((v_conv->agg.k->>1)::bigint, 0)
  from agg
  order by agg.k;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.ad_account_role(uuid) from public, anon;
revoke execute on function public.can_access_ad_account(uuid, public.ad_member_role) from public, anon;
revoke execute on function public.can_read_ad_account(uuid) from public, anon;
revoke execute on function public.add_ad_account_member(uuid, uuid, public.ad_member_role) from public, anon;
revoke execute on function public.set_ad_account_member_role(uuid, uuid, public.ad_member_role) from public, anon;
revoke execute on function public.remove_ad_account_member(uuid, uuid) from public, anon;
revoke execute on function public.estimate_audience(jsonb, uuid) from public, anon;
revoke execute on function public.serve_ads_v2(text, integer) from public, anon;
revoke execute on function public.serve_ads(text, integer) from public, anon;
revoke execute on function public.record_ad_click_v2(uuid) from public, anon;
revoke execute on function public.record_ad_click(uuid) from public, anon;
revoke execute on function public.submit_campaign_for_review(uuid) from public, anon;
revoke execute on function public.submit_ad_for_review(uuid) from public, anon;
revoke execute on function public.review_ad_campaign(uuid, text, text[], text) from public, anon;
revoke execute on function public.review_ad(uuid, text, text[], text) from public, anon;
revoke execute on function public.set_ad_campaign_suspension(uuid, boolean, text[], text) from public, anon;
revoke execute on function public.set_ad_account_suspension(uuid, boolean, text[], text) from public, anon;
revoke execute on function public.appeal_ad_review(uuid, text) from public, anon;
revoke execute on function public.resolve_ad_appeal(uuid, boolean, text) from public, anon;
revoke execute on function public.set_ad_campaign_state(uuid, text) from public, anon;
revoke execute on function public.duplicate_ad_campaign(uuid) from public, anon;
revoke execute on function public.ad_metrics(uuid, date, date, text, uuid) from public, anon;
-- Internal helpers: not callable through the API at all.
revoke execute on function public.ad_profile_matches(jsonb, public.profiles) from public, anon, authenticated;
revoke execute on function public.ad_audience_contains(uuid, uuid, public.profiles) from public, anon, authenticated;
revoke execute on function public.ad_targeting_matches(jsonb, uuid, public.profiles) from public, anon, authenticated;
revoke execute on function public.ad_spend_milli(text, uuid, date) from public, anon, authenticated;
revoke execute on function public.ad_notify_account(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ad_account_role(uuid), public.can_access_ad_account(uuid, public.ad_member_role),
  public.can_read_ad_account(uuid), public.add_ad_account_member(uuid, uuid, public.ad_member_role),
  public.set_ad_account_member_role(uuid, uuid, public.ad_member_role), public.remove_ad_account_member(uuid, uuid),
  public.estimate_audience(jsonb, uuid), public.serve_ads_v2(text, integer), public.serve_ads(text, integer),
  public.record_ad_click_v2(uuid), public.record_ad_click(uuid), public.submit_campaign_for_review(uuid),
  public.submit_ad_for_review(uuid), public.review_ad_campaign(uuid, text, text[], text), public.review_ad(uuid, text, text[], text),
  public.set_ad_campaign_suspension(uuid, boolean, text[], text), public.set_ad_account_suspension(uuid, boolean, text[], text),
  public.appeal_ad_review(uuid, text), public.resolve_ad_appeal(uuid, boolean, text), public.set_ad_campaign_state(uuid, text),
  public.duplicate_ad_campaign(uuid), public.ad_metrics(uuid, date, date, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Data migration: original campaigns join the new hierarchy (one ad set, creative and ad each).
-- Accounts that existed before the Ads Manager keep their subscription-based billing.
-- ---------------------------------------------------------------------------------------------
update public.advertiser_accounts set billing_mode = 'subscription';
update public.advertiser_accounts a set currency = c.currency
from (select distinct on (advertiser_account_id) advertiser_account_id, currency
      from public.ad_campaigns order by advertiser_account_id, created_at) c
where c.advertiser_account_id = a.id;

do $$
declare
  c record;
  v_set uuid;
  v_creative uuid;
  v_ad uuid;
  v_live boolean;
begin
  for c in select * from public.ad_campaigns where structure = 'legacy' order by created_at loop
    v_live := c.status in ('active', 'paused', 'completed');
    insert into public.ad_sets (campaign_id, name, status, placements, targeting, frequency_cap_per_day, starts_at, ends_at)
    values (c.id, 'Default ad set', case when v_live then 'active'::public.ad_entity_status else 'draft'::public.ad_entity_status end,
      array['feed', 'discover', 'marketplace'],
      jsonb_strip_nulls(jsonb_build_object(
        'cities', case when cardinality(c.target_locations) > 0 then to_jsonb(c.target_locations) end,
        'interests', case when cardinality(c.target_interests) > 0 then to_jsonb(c.target_interests) end)),
      c.frequency_cap_per_day, c.starts_on::timestamptz, (c.ends_on + 1)::timestamptz)
    returning id into v_set;
    insert into public.ad_creatives (account_id, name, format, primary_text, headline, destination_url, listing_id, review_status)
    values (c.advertiser_account_id, left(c.name, 120), 'single_image', c.body, c.headline, c.destination_url, c.listing_id,
      case when v_live then 'approved'::public.ad_review_status
           when c.status = 'rejected' then 'rejected'::public.ad_review_status
           else 'pending'::public.ad_review_status end)
    returning id into v_creative;
    insert into public.advertisements (ad_set_id, creative_id, name, status, review_status)
    values (v_set, v_creative, left(c.name, 120),
      case when v_live then 'active'::public.ad_entity_status else 'draft'::public.ad_entity_status end,
      case when v_live then 'approved'::public.ad_review_status
           when c.status = 'rejected' then 'rejected'::public.ad_review_status
           when c.status = 'pending_review' then 'pending'::public.ad_review_status
           else 'draft'::public.ad_review_status end)
    returning id into v_ad;
    update public.ad_events set ad_set_id = v_set, ad_id = v_ad, creative_id = v_creative where campaign_id = c.id;
    update public.ad_campaigns set structure = 'managed' where id = c.id;
  end loop;
end;
$$;
