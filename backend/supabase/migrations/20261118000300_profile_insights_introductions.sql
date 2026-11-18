-- Profile insights (privacy-first view analytics) and introduction requests through a mutual
-- connection.
--
-- Profile views: members only ever see aggregate numbers about their own profile — never who
-- viewed it. A view is recorded at most once per viewer per profile per day, only for profiles
-- the viewer can actually see, and never for your own profile.
--
-- Introductions: A asks B (a connection of A) to introduce them to C (a connection of B).
-- B forwards or declines; once forwarded, C accepts (which connects A and C) or declines.

alter type public.notification_type add value if not exists 'introduction';

-- ---------------------------------------------------------------------------------------------
-- Profile views
-- ---------------------------------------------------------------------------------------------
create table public.profile_views (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, viewed_on),
  check (profile_id <> viewer_id)
);
create index profile_views_profile_day_idx on public.profile_views (profile_id, viewed_on);
create index profile_views_viewer_idx on public.profile_views (viewer_id);

alter table public.profile_views enable row level security;
-- No direct client access at all: writes go through record_profile_view, reads through
-- profile_view_stats (aggregates only).
revoke all on public.profile_views from anon, authenticated;

create or replace function public.record_profile_view(p_profile uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target public.profiles;
begin
  if v_me is null or p_profile is null or p_profile = v_me then
    return;
  end if;
  select * into v_target from public.profiles where id = p_profile;
  if not found then
    return;
  end if;
  -- Only views the viewer was actually allowed to make count.
  if not public.can_view_profile(v_target.id, v_target.profile_visibility, v_target.account_status, v_target.onboarding_completed_at is not null) then
    return;
  end if;
  -- Staff browsing for moderation isn't audience interest.
  if public.is_staff('support') then
    return;
  end if;
  insert into public.profile_views (profile_id, viewer_id) values (p_profile, v_me)
  on conflict do nothing;
end;
$$;

revoke execute on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;

-- Aggregates for the caller's own profile only. Returns one row per day in the window (zeros
-- included) so charts never imply data that doesn't exist.
create or replace function public.profile_view_stats(p_days int default 30)
returns table (day date, views int)
language sql
stable
security definer
set search_path = ''
as $$
  select d::date as day,
         coalesce((select count(*)::int from public.profile_views v
                   where v.profile_id = (select auth.uid()) and v.viewed_on = d::date), 0) as views
  from generate_series(current_date - (least(greatest(coalesce(p_days, 30), 1), 90) - 1), current_date, interval '1 day') as d
  where (select auth.uid()) is not null
  order by 1;
$$;

revoke execute on function public.profile_view_stats(int) from public, anon;
grant execute on function public.profile_view_stats(int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Introduction requests
-- ---------------------------------------------------------------------------------------------
create type public.introduction_status as enum ('pending', 'forwarded', 'accepted', 'declined', 'withdrawn');

create table public.introduction_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  introducer_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(message) between 20 and 600),
  introducer_note text check (char_length(introducer_note) <= 400),
  status public.introduction_status not null default 'pending',
  -- Who declined (introducer or target), so each party sees an honest status.
  declined_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> introducer_id and requester_id <> target_id and introducer_id <> target_id)
);
create index introduction_requests_requester_idx on public.introduction_requests (requester_id, created_at desc);
create index introduction_requests_introducer_idx on public.introduction_requests (introducer_id, status);
create index introduction_requests_target_idx on public.introduction_requests (target_id, status);
create index introduction_requests_declined_by_idx on public.introduction_requests (declined_by);
-- One open request per requester → target at a time.
create unique index introduction_requests_open_unique on public.introduction_requests (requester_id, target_id)
  where status in ('pending', 'forwarded');

alter table public.introduction_requests enable row level security;
revoke all on public.introduction_requests from anon, authenticated;
grant select on public.introduction_requests to authenticated;
-- All writes go through the functions below, which enforce the relationship rules.

create policy "parties read introductions" on public.introduction_requests
  for select to authenticated
  using (
    requester_id = (select auth.uid())
    or introducer_id = (select auth.uid())
    -- The target only learns about a request once the introducer has vouched for it.
    or (target_id = (select auth.uid()) and status in ('forwarded', 'accepted', 'declined') and declined_by is distinct from introducer_id)
    or public.is_staff('moderator')
  );

-- Connection check that doesn't depend on the caller being one of the two members (the shared
-- are_connected helper is deliberately restricted to the caller's own relationships).
create or replace function public.intro_connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = p_a and c.addressee_id = p_b) or (c.requester_id = p_b and c.addressee_id = p_a))
  );
$$;
revoke execute on function public.intro_connected(uuid, uuid) from public, anon, authenticated;

create or replace function public.request_introduction(p_introducer uuid, p_target uuid, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_recent int;
begin
  if v_me is null then
    raise exception 'Sign in to request an introduction' using errcode = '42501';
  end if;
  if not public.is_active_member(v_me) then
    raise exception 'Your account cannot request introductions' using errcode = '42501';
  end if;
  if p_introducer = v_me or p_target = v_me or p_introducer = p_target then
    raise exception 'Invalid introduction' using errcode = '22023';
  end if;
  if not public.intro_connected(v_me, p_introducer) then
    raise exception 'You can only ask your own connections for introductions' using errcode = '42501';
  end if;
  if not public.intro_connected(p_introducer, p_target) then
    raise exception 'That member is not connected to the person you want to meet' using errcode = '42501';
  end if;
  if public.intro_connected(v_me, p_target) then
    raise exception 'You are already connected' using errcode = '23505';
  end if;
  if public.is_blocked_between(v_me, p_target) or public.is_blocked_between(v_me, p_introducer) then
    raise exception 'Introduction unavailable' using errcode = '42501';
  end if;
  -- Abuse prevention: at most 10 requests per rolling week.
  select count(*) into v_recent from public.introduction_requests
  where requester_id = v_me and created_at > now() - interval '7 days';
  if v_recent >= 10 then
    raise exception 'You have reached the weekly limit for introduction requests' using errcode = '54000';
  end if;

  insert into public.introduction_requests (requester_id, introducer_id, target_id, message)
  values (v_me, p_introducer, p_target, trim(p_message))
  returning id into v_id;

  perform public.notify(p_introducer, 'introduction', v_me, 'introduction', v_id, jsonb_build_object('status', 'pending'));
  return v_id;
end;
$$;

-- Introducer: forward (with an optional note) or decline.
create or replace function public.respond_introduction_as_introducer(p_id uuid, p_forward boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  r public.introduction_requests;
begin
  select * into r from public.introduction_requests where id = p_id for update;
  if not found or r.introducer_id is distinct from v_me then
    raise exception 'Introduction not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request has already been handled' using errcode = '55000';
  end if;
  if p_forward then
    if not public.intro_connected(v_me, r.target_id) then
      raise exception 'You are no longer connected to this member' using errcode = '42501';
    end if;
    update public.introduction_requests
      set status = 'forwarded', introducer_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
      where id = p_id;
    perform public.notify(r.target_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'forwarded'));
    perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'forwarded'));
  else
    update public.introduction_requests set status = 'declined', declined_by = v_me, updated_at = now() where id = p_id;
    perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'declined'));
  end if;
end;
$$;

-- Target: accept (connects requester and target) or decline.
create or replace function public.respond_introduction_as_target(p_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  r public.introduction_requests;
begin
  select * into r from public.introduction_requests where id = p_id for update;
  if not found or r.target_id is distinct from v_me or r.status <> 'forwarded' then
    raise exception 'Introduction not found' using errcode = 'P0002';
  end if;
  if p_accept then
    if public.is_blocked_between(r.requester_id, v_me) then
      raise exception 'Introduction unavailable' using errcode = '42501';
    end if;
    update public.introduction_requests set status = 'accepted', updated_at = now() where id = p_id;
    -- Connect the two members (or accept an existing pending request between them).
    update public.connections set status = 'accepted', responded_at = now()
      where status = 'pending'
        and ((requester_id = r.requester_id and addressee_id = v_me) or (requester_id = v_me and addressee_id = r.requester_id));
    if not found and not public.intro_connected(r.requester_id, v_me) then
      insert into public.connections (requester_id, addressee_id, status, responded_at, message)
      values (r.requester_id, v_me, 'accepted', now(), null);
    end if;
    perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'accepted'));
    perform public.notify(r.introducer_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'accepted'));
  else
    update public.introduction_requests set status = 'declined', declined_by = v_me, updated_at = now() where id = p_id;
    perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'declined'));
  end if;
end;
$$;

-- Requester: withdraw while still open.
create or replace function public.withdraw_introduction(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.introduction_requests set status = 'withdrawn', updated_at = now()
  where id = p_id and requester_id = auth.uid() and status in ('pending', 'forwarded');
  if not found then
    raise exception 'Introduction not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Mutual connections the caller could ask for an introduction to p_target. Only returns ids of
-- the caller's own connections, so it reveals nothing the caller couldn't already see.
create or replace function public.introduction_paths(p_target uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when c1.requester_id = (select auth.uid()) then c1.addressee_id else c1.requester_id end
  from public.connections c1
  where c1.status = 'accepted'
    and (select auth.uid()) in (c1.requester_id, c1.addressee_id)
    and p_target <> (select auth.uid())
    and public.intro_connected(case when c1.requester_id = (select auth.uid()) then c1.addressee_id else c1.requester_id end, p_target)
  limit 20;
$$;

revoke execute on function public.request_introduction(uuid, uuid, text) from public, anon;
revoke execute on function public.respond_introduction_as_introducer(uuid, boolean, text) from public, anon;
revoke execute on function public.respond_introduction_as_target(uuid, boolean) from public, anon;
revoke execute on function public.withdraw_introduction(uuid) from public, anon;
revoke execute on function public.introduction_paths(uuid) from public, anon;
grant execute on function public.request_introduction(uuid, uuid, text) to authenticated;
grant execute on function public.respond_introduction_as_introducer(uuid, boolean, text) to authenticated;
grant execute on function public.respond_introduction_as_target(uuid, boolean) to authenticated;
grant execute on function public.withdraw_introduction(uuid) to authenticated;
grant execute on function public.introduction_paths(uuid) to authenticated;
