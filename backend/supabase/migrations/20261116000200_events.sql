-- ---------------------------------------------------------------------------
-- Private events & RSVPs.
--
-- * Hosts: staff, owners of an approved business, or verified executives / public figures.
-- * Visibility: members-only, never anonymous. Drafts are visible to the host and staff only;
--   invite-only events to the host, staff and people holding an RSVP (incl. invitations).
-- * The joining link for virtual events lives in a separate table readable only by the host,
--   staff and confirmed ("going") attendees.
-- * Capacity is enforced in the database: a "going" RSVP beyond capacity becomes "waitlisted",
--   and the earliest waitlisted member is promoted when a seat frees up.
-- ---------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'event_update';

create type public.event_format as enum ('in_person', 'virtual', 'hybrid');
create type public.event_visibility as enum ('members', 'invite_only');
create type public.event_status as enum ('draft', 'published', 'cancelled');
create type public.rsvp_status as enum ('invited', 'interested', 'going', 'waitlisted', 'cancelled');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  summary text check (char_length(summary) <= 280),
  description text check (char_length(description) <= 4000),
  format public.event_format not null default 'in_person',
  venue_name text check (char_length(venue_name) <= 120),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer check (capacity between 1 and 5000),
  visibility public.event_visibility not null default 'members',
  status public.event_status not null default 'draft',
  cover_path text check (char_length(cover_path) <= 300),
  published_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '31 days')
);

create index events_host_idx on public.events (host_id, starts_at desc);
create index events_business_idx on public.events (business_id);
create index events_status_starts_idx on public.events (status, starts_at);

create table public.event_private_details (
  event_id uuid primary key references public.events (id) on delete cascade,
  online_url text check (online_url is null or (online_url ~ '^https://' and char_length(online_url) <= 500)),
  updated_at timestamptz not null default now()
);

create table public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  note text check (char_length(note) <= 280),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_rsvps_user_idx on public.event_rsvps (user_id, status);
create index event_rsvps_event_status_idx on public.event_rsvps (event_id, status, updated_at);
create index event_rsvps_invited_by_idx on public.event_rsvps (invited_by);

create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger event_private_details_set_updated_at before update on public.event_private_details
  for each row execute function public.set_updated_at();
create trigger event_rsvps_set_updated_at before update on public.event_rsvps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can consult other tables without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.can_host_events()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member((select auth.uid()))
    and (
      public.is_staff()
      or exists (
        select 1 from public.businesses b
        where b.owner_id = (select auth.uid()) and b.status = 'approved'
      )
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.verified_kinds && array['executive', 'public_figure']::public.verification_kind[]
      )
    );
$$;

create or replace function public.is_event_host(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_event and e.host_id = (select auth.uid()));
$$;

create or replace function public.has_event_rsvp(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_rsvps r
    where r.event_id = p_event and r.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_event_attendee(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_rsvps r
    where r.event_id = p_event and r.user_id = (select auth.uid()) and r.status = 'going'
  );
$$;

-- Same rule as the events SELECT policy, usable from other policies and RPCs.
create or replace function public.can_view_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event
      and (
        e.host_id = (select auth.uid())
        or public.is_staff()
        or (
          e.status <> 'draft'
          and public.is_active_member((select auth.uid()))
          and (e.visibility = 'members' or public.has_event_rsvp(e.id))
        )
      )
  );
$$;

-- Members may respond only to visible, published events that have not ended.
create or replace function public.can_rsvp_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_event(p_event)
    and exists (select 1 from public.events e where e.id = p_event and e.status = 'published' and e.ends_at > now());
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_private_details enable row level security;
alter table public.event_rsvps enable row level security;

revoke all on public.events, public.event_private_details, public.event_rsvps from anon, authenticated;
grant select, insert, delete on public.events to authenticated;
grant update (business_id, title, summary, description, format, venue_name, city, country, starts_at, ends_at,
  capacity, visibility, status, cover_path) on public.events to authenticated;
grant select, insert, update (online_url), delete on public.event_private_details to authenticated;
grant select, insert, delete on public.event_rsvps to authenticated;
grant update (status, note) on public.event_rsvps to authenticated;

create policy "members see published events; hosts and staff see all" on public.events
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or public.is_staff()
    or (
      status <> 'draft'
      and public.is_active_member((select auth.uid()))
      and (visibility = 'members' or public.has_event_rsvp(id))
    )
  );

create policy "eligible members host events as themselves" on public.events
  for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and public.can_host_events()
    and (business_id is null or public.is_business_owner(business_id))
  );

create policy "hosts edit their events; moderators can moderate" on public.events
  for update to authenticated
  using (host_id = (select auth.uid()) or public.is_staff('moderator'))
  with check (
    (host_id = (select auth.uid()) and (business_id is null or public.is_business_owner(business_id)))
    or public.is_staff('moderator')
  );

create policy "hosts delete drafts; moderators delete any" on public.events
  for delete to authenticated
  using ((host_id = (select auth.uid()) and status = 'draft') or public.is_staff('moderator'));

create policy "joining links for host, staff and confirmed attendees" on public.event_private_details
  for select to authenticated
  using (public.is_event_host(event_id) or public.is_staff() or public.is_event_attendee(event_id));

create policy "hosts manage joining links" on public.event_private_details
  for insert to authenticated
  with check (public.is_event_host(event_id));

create policy "hosts update joining links" on public.event_private_details
  for update to authenticated
  using (public.is_event_host(event_id))
  with check (public.is_event_host(event_id));

create policy "hosts delete joining links" on public.event_private_details
  for delete to authenticated
  using (public.is_event_host(event_id));

-- Own RSVP always; the host and staff see everyone; confirmed attendees see the guest list.
create policy "rsvp visibility" on public.event_rsvps
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_event_host(event_id)
    or public.is_staff()
    or (status = 'going' and public.is_event_attendee(event_id))
  );

create policy "members respond for themselves" on public.event_rsvps
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- 'waitlisted' is what the capacity trigger turns an over-capacity 'going' into.
    and status in ('interested', 'going', 'waitlisted', 'cancelled')
    and public.can_rsvp_event(event_id)
  );

create policy "members update their own response" on public.event_rsvps
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and status in ('interested', 'going', 'waitlisted', 'cancelled')
    and public.can_rsvp_event(event_id)
  );

create policy "members withdraw; hosts remove guests" on public.event_rsvps
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_event_host(event_id) or public.is_staff('moderator'));

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Status bookkeeping and rules a host cannot bypass (cancellation is final).
create or replace function public.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'a cancelled event cannot be reopened' using errcode = 'P0001';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.published_at := coalesce(old.published_at, now());
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_at := now();
    end if;
  elsif new.status = 'published' then
    new.published_at := now();
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') and new.ends_at <= now() then
    raise exception 'an event that has already ended cannot be published' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger events_before_write before insert or update on public.events
  for each row execute function public.events_before_write();

-- Capacity: a "going" response past capacity becomes "waitlisted". The event row is locked so
-- concurrent RSVPs are serialised.
create or replace function public.event_rsvps_enforce_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_going integer;
begin
  if new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    select capacity into v_capacity from public.events where id = new.event_id for update;
    if v_capacity is not null then
      select count(*) into v_going from public.event_rsvps
      where event_id = new.event_id and status = 'going' and user_id <> new.user_id;
      if v_going >= v_capacity then
        new.status := 'waitlisted';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger event_rsvps_enforce_capacity before insert or update of status on public.event_rsvps
  for each row execute function public.event_rsvps_enforce_capacity();

-- Notify the host of new attendees; promote the waitlist when a seat frees up.
create or replace function public.event_rsvps_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_next uuid;
begin
  select * into v_event from public.events where id = coalesce(new.event_id, old.event_id);
  if v_event.id is null then
    return null;
  end if;

  if tg_op <> 'DELETE' and new.status = 'going' and (tg_op = 'INSERT' or old.status <> 'going') then
    perform public.notify(v_event.host_id, 'event_update', new.user_id, 'event', v_event.id,
      jsonb_build_object('status', 'going', 'title', v_event.title),
      'event_going:' || v_event.id || ':' || new.user_id);
  end if;

  if (tg_op = 'DELETE' and old.status = 'going')
     or (tg_op = 'UPDATE' and old.status = 'going' and new.status <> 'going') then
    if v_event.status = 'published' and v_event.ends_at > now() then
      select user_id into v_next from public.event_rsvps
      where event_id = v_event.id and status = 'waitlisted'
      order by updated_at, created_at
      limit 1;
      if v_next is not null then
        update public.event_rsvps set status = 'going' where event_id = v_event.id and user_id = v_next;
        perform public.notify(v_next, 'event_update', null, 'event', v_event.id,
          jsonb_build_object('status', 'promoted', 'title', v_event.title),
          'event_promoted:' || v_event.id || ':' || v_next);
      end if;
    end if;
  end if;
  return null;
end;
$$;

create trigger event_rsvps_after_change after insert or update of status or delete on public.event_rsvps
  for each row execute function public.event_rsvps_after_change();

-- Tell everyone who responded when an event is cancelled.
create or replace function public.events_notify_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status = 'cancelled' and old.status = 'published' then
    for r in
      select user_id from public.event_rsvps
      where event_id = new.id and status in ('invited', 'interested', 'going', 'waitlisted')
    loop
      perform public.notify(r.user_id, 'event_update', new.host_id, 'event', new.id,
        jsonb_build_object('status', 'cancelled', 'title', new.title), 'event_cancelled:' || new.id || ':' || r.user_id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger events_notify_cancelled after update of status on public.events
  for each row execute function public.events_notify_cancelled();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Aggregate counts for events the caller can see. Reveals numbers only, never identities.
create or replace function public.event_stats(p_events uuid[])
returns table (event_id uuid, going_count integer, waitlist_count integer, interested_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.status = 'going'),
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.status = 'waitlisted'),
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.status = 'interested')
  from public.events e
  where e.id = any (coalesce(p_events, '{}'))
    and cardinality(p_events) <= 100
    and public.can_view_event(e.id);
$$;

-- Hosts invite members to their (published or draft) events. Invitations are how invite-only
-- events become visible to a guest.
create or replace function public.invite_to_event(p_event uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event;
  if v_event.id is null or v_event.host_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_event.status = 'cancelled' or v_event.ends_at <= now() then
    raise exception 'this event is no longer accepting guests' using errcode = 'P0001';
  end if;
  if p_user = auth.uid() or not public.is_active_member(p_user) or public.is_blocked_between(auth.uid(), p_user) then
    raise exception 'that member cannot be invited' using errcode = 'P0001';
  end if;
  insert into public.event_rsvps (event_id, user_id, status, invited_by)
  values (p_event, p_user, 'invited', auth.uid())
  on conflict (event_id, user_id) do nothing;
  if found then
    perform public.notify(p_user, 'event_update', auth.uid(), 'event', p_event,
      jsonb_build_object('status', 'invited', 'title', v_event.title), 'event_invited:' || p_event || ':' || p_user);
  end if;
end;
$$;

revoke execute on function public.events_before_write() from public, anon, authenticated;
revoke execute on function public.event_rsvps_enforce_capacity() from public, anon, authenticated;
revoke execute on function public.event_rsvps_after_change() from public, anon, authenticated;
revoke execute on function public.events_notify_cancelled() from public, anon, authenticated;
revoke execute on function public.can_host_events() from public, anon;
revoke execute on function public.is_event_host(uuid) from public, anon;
revoke execute on function public.has_event_rsvp(uuid) from public, anon;
revoke execute on function public.is_event_attendee(uuid) from public, anon;
revoke execute on function public.can_view_event(uuid) from public, anon;
revoke execute on function public.can_rsvp_event(uuid) from public, anon;
revoke execute on function public.event_stats(uuid[]) from public, anon;
revoke execute on function public.invite_to_event(uuid, uuid) from public, anon;
grant execute on function public.can_host_events(), public.is_event_host(uuid), public.has_event_rsvp(uuid),
  public.is_event_attendee(uuid), public.can_view_event(uuid), public.can_rsvp_event(uuid),
  public.event_stats(uuid[]), public.invite_to_event(uuid, uuid) to authenticated;
