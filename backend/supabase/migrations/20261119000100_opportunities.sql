-- ---------------------------------------------------------------------------
-- Opportunities board: members post deals, raises, roles, partnerships, board and advisory
-- seats; other members express interest privately.
--
-- * Signed-out visitors see nothing. Active members see open, unexpired opportunities whose
--   author they can see; 'connections' opportunities only when connected to the author.
-- * Interest is private: only the poster sees who is interested; each member sees their own.
-- * Closed or expired opportunities stay visible to the poster and to members who expressed
--   interest (so their history doesn't vanish), and disappear from everyone else's board.
-- * interest_count, status of someone else's interest, and the author are never
--   client-writable beyond what the triggers allow.
-- ---------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'opportunity';

create type public.opportunity_kind as enum ('investment', 'partnership', 'hiring', 'board_seat', 'advisory', 'acquisition', 'other');
create type public.opportunity_visibility as enum ('members', 'connections');
create type public.opportunity_status as enum ('open', 'closed');
create type public.opportunity_interest_status as enum ('pending', 'shortlisted', 'declined', 'withdrawn');

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind public.opportunity_kind not null,
  title text not null check (char_length(title) between 5 and 120),
  summary text check (char_length(summary) <= 280),
  details text check (char_length(details) <= 4000),
  industry text check (char_length(industry) <= 60),
  location text check (char_length(location) <= 120),
  remote boolean not null default false,
  visibility public.opportunity_visibility not null default 'members',
  amount_min_minor bigint check (amount_min_minor is null or amount_min_minor >= 0),
  amount_max_minor bigint check (amount_max_minor is null or amount_max_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  status public.opportunity_status not null default 'open',
  interest_count integer not null default 0,
  expires_at timestamptz not null default (now() + interval '60 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Amounts only make sense for raises, deals and acquisitions, and always carry a currency.
  check ((amount_min_minor is null and amount_max_minor is null) or kind in ('investment', 'acquisition')),
  check ((amount_min_minor is null and amount_max_minor is null) = (currency is null)),
  check (amount_min_minor is null or amount_max_minor is null or amount_min_minor <= amount_max_minor),
  check (expires_at > created_at and expires_at <= created_at + interval '180 days')
);

create index opportunities_author_idx on public.opportunities (author_id, created_at desc);
create index opportunities_board_idx on public.opportunities (status, expires_at, created_at desc);
create index opportunities_kind_idx on public.opportunities (kind, created_at desc);

create table public.opportunity_interests (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  note text check (char_length(note) <= 500),
  status public.opportunity_interest_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

create index opportunity_interests_user_idx on public.opportunity_interests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Connection check between any two members. Internal only: the shared are_connected helper
-- deliberately answers only about the caller's own relationships.
create or replace function public.opportunity_connected(p_a uuid, p_b uuid)
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
revoke execute on function public.opportunity_connected(uuid, uuid) from public, anon, authenticated;

-- Can the caller see this opportunity?
create or replace function public.can_view_opportunity(
  p_id uuid, p_author uuid, p_visibility public.opportunity_visibility, p_status public.opportunity_status, p_expires timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_author public.profiles;
begin
  if v_me is null then
    return false;
  end if;
  if p_author = v_me or public.is_staff('moderator') then
    return true;
  end if;
  if not public.is_active_member(v_me) then
    return false;
  end if;
  select * into v_author from public.profiles where id = p_author;
  if not found
     or not public.can_view_profile(v_author.id, v_author.profile_visibility, v_author.account_status, v_author.onboarding_completed_at is not null)
     or public.is_blocked_between(v_me, p_author) then
    return false;
  end if;
  if p_visibility = 'connections' and not public.opportunity_connected(v_me, p_author) then
    return false;
  end if;
  -- Live opportunities are on the board; closed/expired ones only for members who responded.
  return (p_status = 'open' and p_expires > now())
    or exists (select 1 from public.opportunity_interests i where i.opportunity_id = p_id and i.user_id = v_me);
end;
$$;
revoke execute on function public.can_view_opportunity(uuid, uuid, public.opportunity_visibility, public.opportunity_status, timestamptz) from public, anon;
grant execute on function public.can_view_opportunity(uuid, uuid, public.opportunity_visibility, public.opportunity_status, timestamptz) to authenticated;

-- Can the caller express interest in this opportunity right now?
create or replace function public.can_express_interest(p_opportunity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.opportunities o
    where o.id = p_opportunity
      and o.author_id <> (select auth.uid())
      and o.status = 'open'
      and o.expires_at > now()
      and public.can_view_opportunity(o.id, o.author_id, o.visibility, o.status, o.expires_at)
  );
$$;
revoke execute on function public.can_express_interest(uuid) from public, anon;
grant execute on function public.can_express_interest(uuid) to authenticated;

-- Is the caller the author of this opportunity? (Used by interest policies.)
create or replace function public.is_opportunity_author(p_opportunity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.opportunities o where o.id = p_opportunity and o.author_id = (select auth.uid()));
$$;
revoke execute on function public.is_opportunity_author(uuid) from public, anon;
grant execute on function public.is_opportunity_author(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Cap: 10 live (open, unexpired) opportunities per author. Serialized per author.
create or replace function public.enforce_opportunity_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status <> 'open') then
    perform pg_advisory_xact_lock(hashtext('opportunities:' || new.author_id::text));
    select count(*) into v_count from public.opportunities
    where author_id = new.author_id and status = 'open' and expires_at > now() and id <> new.id;
    if v_count >= 10 then
      raise exception 'You can have at most 10 open opportunities. Close one to post another.' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;

create trigger opportunities_limit before insert or update of status on public.opportunities
  for each row execute function public.enforce_opportunity_limit();

create or replace function public.touch_opportunity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger opportunities_touch before update on public.opportunities
  for each row execute function public.touch_opportunity();

-- Interest rules. Members may add a note, edit it while pending, withdraw, or re-express after
-- withdrawing. Authors may only move an interest between pending / shortlisted / declined.
create or replace function public.guard_opportunity_interest()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_author boolean;
begin
  -- Trusted internal writes (no API role) are not restricted.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.updated_at := now();
  v_author := public.is_opportunity_author(old.opportunity_id);
  if v_me = old.user_id then
    if new.status is distinct from old.status then
      if not (new.status = 'withdrawn' and old.status in ('pending', 'shortlisted'))
         and not (new.status = 'pending' and old.status = 'withdrawn') then
        raise exception 'You can only withdraw or renew your interest' using errcode = '42501';
      end if;
      if new.status = 'pending' and not public.can_express_interest(old.opportunity_id) then
        raise exception 'This opportunity is no longer open' using errcode = '55000';
      end if;
    elsif new.note is distinct from old.note and old.status <> 'pending' then
      raise exception 'You can only edit your note while it is pending' using errcode = '55000';
    end if;
    return new;
  elsif v_author then
    if new.note is distinct from old.note then
      raise exception 'Only the member can edit their note' using errcode = '42501';
    end if;
    if old.status = 'withdrawn' or new.status not in ('pending', 'shortlisted', 'declined') then
      raise exception 'Invalid status change' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'Not allowed' using errcode = '42501';
end;
$$;

create trigger opportunity_interests_guard before insert or update on public.opportunity_interests
  for each row execute function public.guard_opportunity_interest();

-- Counter + notifications. Runs as owner so it can maintain interest_count, which clients
-- cannot write.
create or replace function public.after_opportunity_interest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_opp public.opportunities;
  v_id uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  update public.opportunities o
    set interest_count = (select count(*) from public.opportunity_interests i where i.opportunity_id = v_id and i.status <> 'withdrawn')
    where o.id = v_id
    returning * into v_opp;

  if tg_op = 'INSERT'
     or (tg_op = 'UPDATE' and new.status = 'pending' and old.status = 'withdrawn') then
    perform public.notify(v_opp.author_id, 'opportunity', new.user_id, 'opportunity', v_opp.id,
      jsonb_build_object('status', 'interest', 'title', v_opp.title));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('shortlisted', 'declined') then
    perform public.notify(new.user_id, 'opportunity', v_opp.author_id, 'opportunity', v_opp.id,
      jsonb_build_object('status', new.status::text, 'title', v_opp.title));
  end if;
  return null;
end;
$$;

create trigger opportunity_interests_after after insert or update or delete on public.opportunity_interests
  for each row execute function public.after_opportunity_interest();

revoke execute on function public.enforce_opportunity_limit() from public, anon, authenticated;
revoke execute on function public.touch_opportunity() from public, anon, authenticated;
revoke execute on function public.guard_opportunity_interest() from public, anon, authenticated;
revoke execute on function public.after_opportunity_interest() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges and policies
-- ---------------------------------------------------------------------------

alter table public.opportunities enable row level security;
alter table public.opportunity_interests enable row level security;

revoke all on public.opportunities from anon, authenticated;
revoke all on public.opportunity_interests from anon, authenticated;

grant select, delete on public.opportunities to authenticated;
grant insert (author_id, kind, title, summary, details, industry, location, remote, visibility,
              amount_min_minor, amount_max_minor, currency, expires_at)
  on public.opportunities to authenticated;
grant update (kind, title, summary, details, industry, location, remote, visibility,
              amount_min_minor, amount_max_minor, currency, expires_at, status)
  on public.opportunities to authenticated;

grant select on public.opportunity_interests to authenticated;
grant insert (opportunity_id, user_id, note) on public.opportunity_interests to authenticated;
grant update (note, status) on public.opportunity_interests to authenticated;

create policy "members read visible opportunities" on public.opportunities
  for select to authenticated
  using (public.can_view_opportunity(id, author_id, visibility, status, expires_at));

create policy "members post opportunities" on public.opportunities
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active_member((select auth.uid()))
    and public.has_feature('feed.post')
    and status = 'open'
  );

create policy "authors edit opportunities" on public.opportunities
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "authors or staff delete opportunities" on public.opportunities
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_staff('moderator'));

create policy "interest visible to member and poster" on public.opportunity_interests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_opportunity_author(opportunity_id) or public.is_staff('moderator'));

create policy "members express interest" on public.opportunity_interests
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_express_interest(opportunity_id));

create policy "member or poster update interest" on public.opportunity_interests
  for update to authenticated
  using (user_id = (select auth.uid()) or public.is_opportunity_author(opportunity_id))
  with check (user_id = (select auth.uid()) or public.is_opportunity_author(opportunity_id));
