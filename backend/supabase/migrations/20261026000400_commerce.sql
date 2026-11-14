-- Businesses (with business verification), luxury listings and inquiries, advertising,
-- and account deletion requests.

create type public.business_category as enum (
  'hospitality', 'real_estate', 'automotive', 'yachting', 'aviation', 'events', 'experiences', 'concierge', 'other'
);
create type public.business_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'suspended');
create type public.listing_category as enum (
  'hotel', 'resort', 'villa', 'apartment', 'supercar', 'yacht', 'event', 'experience'
);
-- Lifecycle: draft -> pending_review -> published | rejected; published <-> archived;
-- any -> removed (moderation only). Material edits to an approved listing send it back to review.
create type public.listing_status as enum ('draft', 'pending_review', 'published', 'rejected', 'archived', 'removed');
create type public.listing_visibility as enum ('public', 'members');
create type public.price_unit as enum ('night', 'week', 'month', 'day', 'person', 'event', 'total');
create type public.inquiry_status as enum ('new', 'responded', 'closed');
create type public.advertiser_status as enum ('active', 'suspended');
create type public.campaign_status as enum ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected');
create type public.campaign_objective as enum ('awareness', 'traffic', 'inquiries');
create type public.ad_event_type as enum ('impression', 'click');
create type public.deletion_status as enum ('pending', 'processing', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Businesses. status = 'approved' IS business verification.
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  category public.business_category not null,
  description text check (char_length(description) <= 3000),
  website text check (website is null or website ~ '^https://'),
  location text check (char_length(location) <= 120),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  logo_path text,
  registration_number text check (char_length(registration_number) <= 80),
  evidence_paths text[] not null default '{}' check (cardinality(evidence_paths) <= 5),
  status public.business_status not null default 'draft',
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index businesses_owner_idx on public.businesses (owner_id);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();
create trigger businesses_status_history after insert or update on public.businesses
  for each row execute function public.track_status_change('business', 'status', 'owner_id');

create or replace function public.submit_business_for_review(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_feature('business.manage') then
    raise exception 'a Luxury Business membership is required' using errcode = '42501';
  end if;
  update public.businesses set status = 'pending_review', review_note = null
  where id = p_id and owner_id = auth.uid() and status in ('draft', 'rejected');
  if not found then
    raise exception 'business cannot be submitted' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.review_business(p_id uuid, p_status public.business_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'invalid decision' using errcode = 'P0001';
  end if;
  update public.businesses
  set status = p_status, review_note = left(p_note, 2000), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and (status = 'pending_review' or (p_status = 'suspended' and status = 'approved'))
  returning owner_id into v_owner;
  if v_owner is null then
    raise exception 'business not reviewable' using errcode = 'P0001';
  end if;
  perform public.notify(v_owner, 'business_update', null, 'business', p_id, jsonb_build_object('status', p_status));
  perform public.write_audit('business.' || p_status::text, 'business', p_id::text, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.is_business_owner(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.businesses b where b.id = p_business and b.owner_id = auth.uid());
$$;

create or replace function public.is_business_approved(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    join public.profiles o on o.id = b.owner_id and o.account_status = 'active'
    where b.id = p_business and b.status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,120}$'),
  category public.listing_category not null,
  summary text check (char_length(summary) <= 240),
  description text check (char_length(description) <= 6000),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  price_from_minor bigint check (price_from_minor is null or price_from_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  price_unit public.price_unit,
  amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  visibility public.listing_visibility not null default 'public',
  status public.listing_status not null default 'draft',
  cover_path text,
  approved_at timestamptz,
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((price_from_minor is null) = (currency is null))
);

create index listings_browse_idx on public.listings (category, published_at desc) where status = 'published';
create index listings_business_idx on public.listings (business_id);
create index listings_review_idx on public.listings (created_at) where status = 'pending_review';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();
create trigger listings_status_history after insert or update on public.listings
  for each row execute function public.track_status_change('listing', 'status', '');

-- Material edits invalidate a prior approval; a published listing returns to review.
create or replace function public.listings_require_rereview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approved_at is not null and (
    new.title, new.category, new.summary, new.description, new.city, new.country,
    new.price_from_minor, new.currency, new.price_unit, new.amenities, new.cover_path
  ) is distinct from (
    old.title, old.category, old.summary, old.description, old.city, old.country,
    old.price_from_minor, old.currency, old.price_unit, old.amenities, old.cover_path
  ) then
    new.approved_at := null;
    if old.status = 'published' then
      new.status := 'pending_review';
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_rereview before update on public.listings
  for each row execute function public.listings_require_rereview();

create table public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  alt_text text check (char_length(alt_text) <= 300),
  position smallint not null default 0 check (position between 0 and 19)
);

create index listing_media_listing_idx on public.listing_media (listing_id, position);

create table public.listing_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- An inquiry is a request for contact; it never represents a confirmed booking.
create table public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  preferred_dates text check (char_length(preferred_dates) <= 120),
  party_size smallint check (party_size between 1 and 500),
  status public.inquiry_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listing_inquiries_listing_idx on public.listing_inquiries (listing_id, created_at desc);
create index listing_inquiries_sender_idx on public.listing_inquiries (sender_id, created_at desc);

create trigger listing_inquiries_set_updated_at
  before update on public.listing_inquiries
  for each row execute function public.set_updated_at();

create or replace function public.can_view_listing(p_business uuid, p_status public.listing_status, p_visibility public.listing_visibility)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_business_owner(p_business)
    or public.is_staff('moderator')
    or (
      p_status = 'published'
      and public.is_business_approved(p_business)
      and (p_visibility = 'public' or public.has_feature('luxury.view_members'))
    );
$$;

create or replace function public.submit_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.listings where id = p_id for update;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'listing not found' using errcode = 'P0001';
  end if;
  if not public.has_feature('listings.publish') then
    raise exception 'a Luxury Business membership is required to publish' using errcode = '42501';
  end if;
  if not public.is_business_approved(v_business) then
    raise exception 'your business must be verified before listings can be submitted' using errcode = '42501';
  end if;
  update public.listings set status = 'pending_review', review_note = null
  where id = p_id and status in ('draft', 'rejected');
  if not found then
    raise exception 'only draft or rejected listings can be submitted' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.review_listing(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.listings l
  set status = case when p_approve then 'published'::public.listing_status else 'rejected'::public.listing_status end,
      approved_at = case when p_approve then now() end,
      published_at = case when p_approve then coalesce(l.published_at, now()) else l.published_at end,
      review_note = left(p_note, 2000),
      reviewed_by = auth.uid()
  where l.id = p_id and l.status = 'pending_review';
  if not found then
    raise exception 'listing is not awaiting review' using errcode = 'P0001';
  end if;
  select b.owner_id into v_owner from public.listings l join public.businesses b on b.id = l.business_id where l.id = p_id;
  perform public.notify(v_owner, 'business_update', null, 'listing', p_id,
    jsonb_build_object('status', case when p_approve then 'published' else 'rejected' end));
  perform public.write_audit(case when p_approve then 'listing.approved' else 'listing.rejected' end, 'listing', p_id::text,
    jsonb_build_object('note', p_note));
end;
$$;

-- Owner lifecycle actions: archive (unpublish) and republish a previously approved listing.
create or replace function public.set_listing_status(p_id uuid, p_status public.listing_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_l public.listings;
begin
  select * into v_l from public.listings where id = p_id for update;
  if v_l.id is null or not public.is_business_owner(v_l.business_id) then
    raise exception 'listing not found' using errcode = 'P0001';
  end if;

  if p_status = 'archived' and v_l.status in ('published', 'draft', 'rejected') then
    update public.listings set status = 'archived' where id = p_id;
  elsif p_status = 'published' and v_l.status = 'archived' then
    if v_l.approved_at is null then
      raise exception 'this listing changed since approval and must be submitted for review' using errcode = 'P0001';
    end if;
    if not public.has_feature('listings.publish') or not public.is_business_approved(v_l.business_id) then
      raise exception 'publishing requires a verified business and an active Luxury Business membership' using errcode = '42501';
    end if;
    update public.listings set status = 'published', published_at = now() where id = p_id;
  elsif p_status = 'draft' and v_l.status in ('archived', 'rejected') then
    update public.listings set status = 'draft' where id = p_id;
  else
    raise exception 'cannot move listing from % to %', v_l.status, p_status using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.notify_on_inquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(b.owner_id, 'listing_inquiry', new.sender_id, 'listing_inquiry', new.id,
    jsonb_build_object('listing_id', new.listing_id), 'listing_inquiry:' || new.id)
  from public.listings l join public.businesses b on b.id = l.business_id
  where l.id = new.listing_id;
  return null;
end;
$$;

create trigger listing_inquiries_notify after insert on public.listing_inquiries
  for each row execute function public.notify_on_inquiry();

-- ---------------------------------------------------------------------------
-- Advertising
-- ---------------------------------------------------------------------------
create table public.advertiser_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  billing_email text check (billing_email is null or billing_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  business_id uuid references public.businesses (id) on delete set null,
  status public.advertiser_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advertiser_accounts_set_updated_at
  before update on public.advertiser_accounts
  for each row execute function public.set_updated_at();

-- Platform rate card (prices are set by ELVORA, never by the advertiser).
create table public.ad_rate_cards (
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  objective public.campaign_objective not null,
  cpm_minor bigint not null check (cpm_minor > 0),
  cpc_minor bigint not null check (cpc_minor >= 0),
  active boolean not null default true,
  primary key (currency, objective)
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_account_id uuid not null references public.advertiser_accounts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  objective public.campaign_objective not null,
  status public.campaign_status not null default 'draft',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  daily_budget_minor bigint not null check (daily_budget_minor > 0),
  total_budget_minor bigint not null check (total_budget_minor >= daily_budget_minor),
  starts_on date not null,
  ends_on date not null,
  headline text not null check (char_length(headline) between 3 and 90),
  body text check (char_length(body) <= 280),
  destination_url text check (destination_url is null or destination_url ~ '^https://'),
  listing_id uuid references public.listings (id) on delete set null,
  target_locations text[] not null default '{}' check (cardinality(target_locations) <= 20),
  target_interests text[] not null default '{}' check (cardinality(target_interests) <= 20),
  frequency_cap_per_day smallint not null default 3 check (frequency_cap_per_day between 1 and 20),
  -- Prices snapshotted from the rate card at submission (trusted; not client-writable).
  cpm_minor bigint,
  cpc_minor bigint,
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (destination_url is not null or listing_id is not null)
);

create index ad_campaigns_owner_idx on public.ad_campaigns (owner_id, created_at desc);
create index ad_campaigns_serving_idx on public.ad_campaigns (starts_on, ends_on) where status = 'active';

create trigger ad_campaigns_set_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();
create trigger ad_campaigns_status_history after insert or update on public.ad_campaigns
  for each row execute function public.track_status_change('ad_campaign', 'status', 'owner_id');

-- Measured delivery events. Costs are in milli-minor units (1/1000 of a minor unit) so
-- per-impression CPM pricing is exact: impression cost = cpm_minor, click cost = cpc_minor * 1000.
create table public.ad_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  event_type public.ad_event_type not null,
  viewer_id uuid references public.profiles (id) on delete set null,
  impression_id uuid references public.ad_events (id) on delete cascade,
  placement text not null check (placement in ('feed', 'luxury', 'discover')),
  cost_milli bigint not null default 0 check (cost_milli >= 0),
  occurred_at timestamptz not null default now(),
  check ((event_type = 'click') = (impression_id is not null))
);

create index ad_events_campaign_idx on public.ad_events (campaign_id, occurred_at);
create index ad_events_viewer_idx on public.ad_events (viewer_id, campaign_id, occurred_at) where event_type = 'impression';
create unique index ad_events_one_click_per_impression on public.ad_events (impression_id) where event_type = 'click';

create or replace function public.transition_campaign(p_id uuid, p_action text, p_note text default null)
returns public.campaign_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.ad_campaigns;
  v_rate public.ad_rate_cards;
  v_next public.campaign_status;
begin
  select * into v_c from public.ad_campaigns where id = p_id for update;
  if v_c.id is null then
    raise exception 'campaign not found' using errcode = 'P0001';
  end if;

  if p_action in ('approve', 'reject') then
    if not public.is_staff('moderator') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_c.status <> 'pending_review' then
      raise exception 'campaign is not awaiting review' using errcode = 'P0001';
    end if;
    v_next := case p_action when 'approve' then 'active'::public.campaign_status else 'rejected'::public.campaign_status end;
    update public.ad_campaigns set status = v_next, reviewed_by = auth.uid(), review_note = left(p_note, 2000) where id = p_id;
    perform public.notify(v_c.owner_id, 'campaign_update', null, 'ad_campaign', p_id, jsonb_build_object('status', v_next));
    perform public.write_audit('campaign.' || p_action, 'ad_campaign', p_id::text, jsonb_build_object('note', p_note));
    return v_next;
  end if;

  if v_c.owner_id is distinct from auth.uid() then
    raise exception 'campaign not found' using errcode = 'P0001';
  end if;
  if not public.has_feature('ads.manage') then
    raise exception 'an Advertiser membership is required' using errcode = '42501';
  end if;
  if exists (select 1 from public.advertiser_accounts a where a.id = v_c.advertiser_account_id and a.status <> 'active') then
    raise exception 'advertiser account is suspended' using errcode = '42501';
  end if;

  if p_action = 'submit' then
    if v_c.status not in ('draft', 'rejected') then
      raise exception 'only draft or rejected campaigns can be submitted' using errcode = 'P0001';
    end if;
    if v_c.ends_on < current_date then
      raise exception 'campaign end date is in the past' using errcode = 'P0001';
    end if;
    select * into v_rate from public.ad_rate_cards r where r.currency = v_c.currency and r.objective = v_c.objective and r.active;
    if v_rate.currency is null then
      raise exception 'advertising is not yet available in %', v_c.currency using errcode = 'P0001';
    end if;
    update public.ad_campaigns
    set status = 'pending_review', review_note = null, cpm_minor = v_rate.cpm_minor, cpc_minor = v_rate.cpc_minor, submitted_at = now()
    where id = p_id;
    return 'pending_review';
  end if;

  v_next := case
    when p_action = 'pause' and v_c.status = 'active' then 'paused'
    when p_action = 'resume' and v_c.status = 'paused' then 'active'
    when p_action = 'withdraw' and v_c.status = 'pending_review' then 'draft'
    when p_action = 'end' and v_c.status in ('active', 'paused') then 'completed'
    else null
  end;
  if v_next is null then
    raise exception 'action % not allowed from status %', p_action, v_c.status using errcode = 'P0001';
  end if;
  update public.ad_campaigns set status = v_next where id = p_id;
  return v_next;
end;
$$;

-- Spend so far, in minor units (rounded up), optionally for one day.
create or replace function public.campaign_spend_minor(p_campaign uuid, p_day date default null)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ceil(sum(e.cost_milli) / 1000.0), 0)::bigint
  from public.ad_events e
  where e.campaign_id = p_campaign
    and (p_day is null or e.occurred_at >= p_day::timestamptz and e.occurred_at < (p_day + 1)::timestamptz);
$$;

-- Select and record sponsored placements for the current viewer.
-- Only active, in-schedule, in-budget campaigns that match targeting and the viewer's
-- frequency cap are eligible. Each returned row is a recorded, measured impression.
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_profile public.profiles;
  v_c record;
  v_imp uuid;
  v_served integer := 0;
begin
  if v_viewer is null or not public.is_active_member(v_viewer) then
    return;
  end if;
  if p_placement not in ('feed', 'luxury', 'discover') then
    raise exception 'invalid placement' using errcode = 'P0001';
  end if;
  select * into v_profile from public.profiles where id = v_viewer;

  for v_c in
    select c.*, a.display_name as account_name
    from public.ad_campaigns c
    join public.advertiser_accounts a on a.id = c.advertiser_account_id and a.status = 'active'
    join public.profiles o on o.id = c.owner_id and o.account_status = 'active'
    where c.status = 'active'
      and current_date between c.starts_on and c.ends_on
      and c.owner_id <> v_viewer
      and not public.is_blocked_between(v_viewer, c.owner_id)
      and (cardinality(c.target_locations) = 0 or exists (
        select 1 from unnest(c.target_locations) loc where v_profile.location ilike '%' || loc || '%'))
      and (cardinality(c.target_interests) = 0 or exists (
        select 1 from unnest(c.target_interests) i join unnest(v_profile.interests) vi on lower(vi) = lower(i)))
    order by random()
    limit 10
  loop
    exit when v_served >= least(greatest(p_limit, 1), 3);

    -- Serialize spend checks per campaign.
    perform 1 from public.ad_campaigns where id = v_c.id for update;

    continue when (
      select count(*) from public.ad_events e
      where e.campaign_id = v_c.id and e.viewer_id = v_viewer and e.event_type = 'impression'
        and e.occurred_at > now() - interval '24 hours'
    ) >= v_c.frequency_cap_per_day;
    continue when public.campaign_spend_minor(v_c.id, current_date) + ceil(v_c.cpm_minor / 1000.0) > v_c.daily_budget_minor;
    continue when public.campaign_spend_minor(v_c.id) + ceil(v_c.cpm_minor / 1000.0) > v_c.total_budget_minor;

    insert into public.ad_events (campaign_id, event_type, viewer_id, placement, cost_milli)
    values (v_c.id, 'impression', v_viewer, p_placement, v_c.cpm_minor)
    returning id into v_imp;

    impression_id := v_imp;
    campaign_id := v_c.id;
    headline := v_c.headline;
    body := v_c.body;
    destination_url := v_c.destination_url;
    listing_id := v_c.listing_id;
    advertiser_name := v_c.account_name;
    v_served := v_served + 1;
    return next;
  end loop;
end;
$$;

-- Record a click for an impression served to this viewer (once per impression, within 1 hour).
create or replace function public.record_ad_click(p_impression uuid)
returns table (destination_url text, listing_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imp public.ad_events;
  v_c public.ad_campaigns;
begin
  select * into v_imp from public.ad_events
  where id = p_impression and event_type = 'impression' and viewer_id = auth.uid()
    and occurred_at > now() - interval '1 hour';
  if v_imp.id is null then
    raise exception 'impression not found' using errcode = 'P0001';
  end if;
  select * into v_c from public.ad_campaigns where id = v_imp.campaign_id for update;

  insert into public.ad_events (campaign_id, event_type, viewer_id, impression_id, placement, cost_milli)
  select v_c.id, 'click', auth.uid(), v_imp.id, v_imp.placement,
    case when v_c.objective = 'traffic'
          and public.campaign_spend_minor(v_c.id) + coalesce(v_c.cpc_minor, 0) <= v_c.total_budget_minor
         then coalesce(v_c.cpc_minor, 0) * 1000 else 0 end
  on conflict do nothing;

  destination_url := v_c.destination_url;
  listing_id := v_c.listing_id;
  return next;
end;
$$;

-- Daily measured report for a campaign the viewer owns (or staff).
create or replace function public.campaign_report(p_campaign uuid)
returns table (day date, impressions bigint, clicks bigint, spend_minor bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (e.occurred_at at time zone 'UTC')::date as day,
    count(*) filter (where e.event_type = 'impression'),
    count(*) filter (where e.event_type = 'click'),
    ceil(sum(e.cost_milli) / 1000.0)::bigint
  from public.ad_events e
  where e.campaign_id = p_campaign
  group by 1
  order by 1 desc
  limit 366;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion requests (processed by staff / a scheduled job with the service role)
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 1000),
  status public.deletion_status not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index account_deletion_one_open on public.account_deletion_requests (user_id)
  where status in ('pending', 'processing');

create or replace function public.cancel_account_deletion()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.account_deletion_requests set status = 'cancelled', processed_at = now()
  where user_id = auth.uid() and status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_saves enable row level security;
alter table public.listing_inquiries enable row level security;
alter table public.advertiser_accounts enable row level security;
alter table public.ad_rate_cards enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_events enable row level security;
alter table public.account_deletion_requests enable row level security;

revoke all on public.businesses, public.listings, public.listing_media, public.listing_saves,
  public.listing_inquiries, public.advertiser_accounts, public.ad_rate_cards, public.ad_campaigns,
  public.ad_events, public.account_deletion_requests
  from anon, authenticated;

grant select on public.businesses to anon, authenticated;
grant insert (owner_id, name, slug, category, description, website, location, contact_email, logo_path, registration_number, evidence_paths)
  on public.businesses to authenticated;
grant update (name, description, website, location, contact_email, logo_path, registration_number, evidence_paths)
  on public.businesses to authenticated;
create policy "approved businesses are public" on public.businesses
  for select using (
    (status = 'approved' and exists (select 1 from public.profiles o where o.id = owner_id and o.account_status = 'active'))
    or owner_id = auth.uid() or public.is_staff('moderator')
  );
create policy "business members create businesses" on public.businesses
  for insert to authenticated
  with check (owner_id = auth.uid() and status = 'draft' and public.has_feature('business.manage'));
create policy "owners edit businesses" on public.businesses
  for update to authenticated
  using (owner_id = auth.uid() and status <> 'suspended')
  with check (owner_id = auth.uid());

grant select on public.listings to anon, authenticated;
grant insert (business_id, title, slug, category, summary, description, city, country, price_from_minor, currency, price_unit, amenities, visibility, cover_path)
  on public.listings to authenticated;
grant update (title, category, summary, description, city, country, price_from_minor, currency, price_unit, amenities, visibility, cover_path)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;
create policy "listings visible per status and audience" on public.listings
  for select using (public.can_view_listing(business_id, status, visibility));
create policy "owners create draft listings" on public.listings
  for insert to authenticated
  with check (status = 'draft' and public.is_business_owner(business_id) and public.has_feature('business.manage'));
create policy "owners edit listings" on public.listings
  for update to authenticated
  using (public.is_business_owner(business_id) and status not in ('removed', 'pending_review'))
  with check (public.is_business_owner(business_id));
create policy "owners delete unpublished listings" on public.listings
  for delete to authenticated using (public.is_business_owner(business_id) and status in ('draft', 'rejected', 'archived'));

grant select on public.listing_media to anon, authenticated;
grant insert (listing_id, storage_path, alt_text, position) on public.listing_media to authenticated;
grant delete on public.listing_media to authenticated;
create policy "media follows listing" on public.listing_media
  for select using (exists (select 1 from public.listings l where l.id = listing_id));
create policy "owners add listing media" on public.listing_media
  for insert to authenticated
  with check (
    storage_path like auth.uid()::text || '/%'
    and exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id))
  );
create policy "owners remove listing media" on public.listing_media
  for delete to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id)));

grant select, insert, delete on public.listing_saves to authenticated;
create policy "own listing saves read" on public.listing_saves for select to authenticated using (user_id = auth.uid());
create policy "own listing saves insert" on public.listing_saves for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member() and exists (select 1 from public.listings l where l.id = listing_id));
create policy "own listing saves delete" on public.listing_saves for delete to authenticated using (user_id = auth.uid());

grant select on public.listing_inquiries to authenticated;
grant insert (listing_id, sender_id, message, preferred_dates, party_size) on public.listing_inquiries to authenticated;
grant update (status) on public.listing_inquiries to authenticated;
create policy "inquiry parties read" on public.listing_inquiries
  for select to authenticated
  using (
    sender_id = auth.uid()
    or exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id))
  );
create policy "eligible members send inquiries" on public.listing_inquiries
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and status = 'new'
    and public.has_feature('luxury.inquire')
    and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'published')
  );
create policy "business owners update inquiry status" on public.listing_inquiries
  for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id)));

grant select on public.advertiser_accounts to authenticated;
grant insert (owner_id, display_name, billing_email, business_id) on public.advertiser_accounts to authenticated;
grant update (display_name, billing_email, business_id) on public.advertiser_accounts to authenticated;
create policy "owners and staff read advertiser accounts" on public.advertiser_accounts
  for select to authenticated using (owner_id = auth.uid() or public.is_staff('moderator'));
create policy "advertisers open an account" on public.advertiser_accounts
  for insert to authenticated
  with check (
    owner_id = auth.uid() and public.has_feature('ads.manage')
    and (business_id is null or public.is_business_owner(business_id))
  );
create policy "owners edit advertiser accounts" on public.advertiser_accounts
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (business_id is null or public.is_business_owner(business_id)));

grant select on public.ad_rate_cards to authenticated;
create policy "rate cards readable by members" on public.ad_rate_cards for select to authenticated using (active);

grant select on public.ad_campaigns to authenticated;
grant insert (advertiser_account_id, owner_id, name, objective, currency, daily_budget_minor, total_budget_minor, starts_on, ends_on,
  headline, body, destination_url, listing_id, target_locations, target_interests, frequency_cap_per_day) on public.ad_campaigns to authenticated;
grant update (name, objective, currency, daily_budget_minor, total_budget_minor, starts_on, ends_on,
  headline, body, destination_url, listing_id, target_locations, target_interests, frequency_cap_per_day) on public.ad_campaigns to authenticated;
grant delete on public.ad_campaigns to authenticated;
create policy "owners and staff read campaigns" on public.ad_campaigns
  for select to authenticated using (owner_id = auth.uid() or public.is_staff('moderator'));
create policy "advertisers create campaigns" on public.ad_campaigns
  for insert to authenticated
  with check (
    owner_id = auth.uid() and status = 'draft' and public.has_feature('ads.manage')
    and exists (select 1 from public.advertiser_accounts a where a.id = advertiser_account_id and a.owner_id = auth.uid() and a.status = 'active')
    and (listing_id is null or exists (
      select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id)))
  );
create policy "owners edit draft campaigns" on public.ad_campaigns
  for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'rejected'))
  with check (owner_id = auth.uid() and (listing_id is null or exists (
    select 1 from public.listings l where l.id = listing_id and public.is_business_owner(l.business_id))));
create policy "owners delete draft campaigns" on public.ad_campaigns
  for delete to authenticated using (owner_id = auth.uid() and status in ('draft', 'rejected'));

grant select on public.ad_events to authenticated;
create policy "owners read campaign events" on public.ad_events
  for select to authenticated
  using (exists (select 1 from public.ad_campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_staff('moderator'))));

grant select on public.account_deletion_requests to authenticated;
grant insert (user_id, reason) on public.account_deletion_requests to authenticated;
create policy "own deletion requests" on public.account_deletion_requests
  for select to authenticated using (user_id = auth.uid() or public.is_staff('admin'));
create policy "request own deletion" on public.account_deletion_requests
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

revoke execute on function public.submit_business_for_review(uuid) from public, anon;
revoke execute on function public.review_business(uuid, public.business_status, text) from public, anon;
revoke execute on function public.submit_listing(uuid) from public, anon;
revoke execute on function public.review_listing(uuid, boolean, text) from public, anon;
revoke execute on function public.set_listing_status(uuid, public.listing_status) from public, anon;
revoke execute on function public.transition_campaign(uuid, text, text) from public, anon;
revoke execute on function public.serve_ads(text, integer) from public, anon;
revoke execute on function public.record_ad_click(uuid) from public, anon;
revoke execute on function public.campaign_spend_minor(uuid, date) from public, anon, authenticated;
revoke execute on function public.cancel_account_deletion() from public, anon;
