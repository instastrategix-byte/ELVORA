-- ---------------------------------------------------------------------------
-- Communities: member-run groups with discussion threads.
--
-- * Open communities: any active member can read and join instantly.
-- * Private communities: name and description are listed, but threads and replies are visible
--   only to approved members. Joining creates a pending request a moderator approves.
-- * Roles: owner (creator), moderator, member. Owners promote/demote and ban moderators;
--   moderators approve requests, ban members, pin/lock/delete threads.
-- * Trusted columns (member counts, reply counts, roles, membership status) are maintained by
--   triggers and are never directly client-writable beyond what the policies allow.
-- * Signed-out visitors see nothing.
-- ---------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'community_reply';
alter type public.notification_type add value if not exists 'community_request';

create type public.community_visibility as enum ('open', 'private');
create type public.community_role as enum ('owner', 'moderator', 'member');
create type public.community_member_status as enum ('active', 'pending', 'banned');

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 3 and 80),
  description text check (char_length(description) <= 2000),
  category text check (char_length(category) <= 40),
  visibility public.community_visibility not null default 'open',
  cover_path text check (char_length(cover_path) <= 300),
  created_by uuid not null references public.profiles (id) on delete cascade,
  member_count integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communities_created_by_idx on public.communities (created_by);
create index communities_listing_idx on public.communities (member_count desc, created_at desc) where archived_at is null;

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.community_role not null default 'member',
  status public.community_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index community_members_user_idx on public.community_members (user_id, status);
create index community_members_status_idx on public.community_members (community_id, status, role);

create table public.community_threads (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  pinned boolean not null default false,
  locked boolean not null default false,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_threads_activity_idx on public.community_threads (community_id, pinned desc, last_activity_at desc, id desc);
create index community_threads_author_idx on public.community_threads (author_id);

create table public.community_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index community_replies_thread_idx on public.community_replies (thread_id, created_at, id);
create index community_replies_author_idx on public.community_replies (author_id);

create trigger communities_set_updated_at before update on public.communities
  for each row execute function public.set_updated_at();
create trigger community_members_set_updated_at before update on public.community_members
  for each row execute function public.set_updated_at();
create trigger community_threads_set_updated_at before update on public.community_threads
  for each row execute function public.set_updated_at();
create trigger community_replies_set_updated_at before update on public.community_replies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can consult membership without recursion)
-- ---------------------------------------------------------------------------

-- The caller's role in a community, only while their membership is active.
create or replace function public.community_role_of(p_community uuid)
returns public.community_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.community_members m
  where m.community_id = p_community and m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create or replace function public.is_community_member(p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.community_role_of(p_community) is not null;
$$;

create or replace function public.is_community_moderator(p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.community_role_of(p_community) in ('owner', 'moderator'), false);
$$;

-- Threads and replies: staff always; otherwise an active member of the platform, and for
-- private communities an approved member of the community. Archived communities stay readable
-- to their members only.
create or replace function public.can_view_community_content(p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff()
    or exists (
      select 1 from public.communities c
      where c.id = p_community
        and public.is_active_member((select auth.uid()))
        and (
          public.is_community_member(c.id)
          or (c.visibility = 'open' and c.archived_at is null)
        )
    );
$$;

-- Posting requires an active membership in a live community.
create or replace function public.can_post_in_community(p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member((select auth.uid()))
    and public.is_community_member(p_community)
    and exists (select 1 from public.communities c where c.id = p_community and c.archived_at is null);
$$;

create or replace function public.can_reply_to_thread(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.community_threads t
    where t.id = p_thread and not t.locked and public.can_post_in_community(t.community_id)
  );
$$;

create or replace function public.thread_community(p_thread uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.community_id from public.community_threads t where t.id = p_thread;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_threads enable row level security;
alter table public.community_replies enable row level security;

revoke all on public.communities, public.community_members, public.community_threads, public.community_replies from anon, authenticated;

grant select on public.communities to authenticated;
grant insert (slug, name, description, category, visibility, cover_path, created_by) on public.communities to authenticated;
grant update (name, description, category, visibility, cover_path, archived_at) on public.communities to authenticated;
grant delete on public.communities to authenticated;

grant select, delete on public.community_members to authenticated;
grant insert (community_id, user_id) on public.community_members to authenticated;
grant update (role, status) on public.community_members to authenticated;

grant select, delete on public.community_threads to authenticated;
grant insert (community_id, author_id, title, body) on public.community_threads to authenticated;
grant update (title, body, pinned, locked) on public.community_threads to authenticated;

grant select, delete on public.community_replies to authenticated;
grant insert (thread_id, author_id, body) on public.community_replies to authenticated;
grant update (body) on public.community_replies to authenticated;

-- Communities are listed to active members (private ones too, so people can request to join).
-- Archived communities remain visible to their own members and staff.
create policy "active members see communities" on public.communities
  for select to authenticated
  using (
    public.is_staff()
    or created_by = (select auth.uid())
    or (
      public.is_active_member((select auth.uid()))
      and (archived_at is null or public.is_community_member(id))
    )
  );

create policy "members with posting rights create communities" on public.communities
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_active_member((select auth.uid())) and public.has_feature('feed.post'));

create policy "owners and staff edit communities" on public.communities
  for update to authenticated
  using (public.community_role_of(id) = 'owner' or public.is_staff('moderator'))
  with check (public.community_role_of(id) = 'owner' or public.is_staff('moderator'));

create policy "staff delete communities" on public.communities
  for delete to authenticated
  using (public.is_staff('moderator'));

-- Own membership row always; active rosters to people who can read the community; the full
-- roster (pending and banned) to its moderators and staff.
create policy "membership visibility" on public.community_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_staff()
    or public.is_community_moderator(community_id)
    or (status = 'active' and public.can_view_community_content(community_id))
  );

create policy "members join for themselves" on public.community_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_member((select auth.uid()))
    and exists (select 1 from public.communities c where c.id = community_id and c.archived_at is null)
  );

create policy "moderators manage membership" on public.community_members
  for update to authenticated
  using (public.is_community_moderator(community_id) or public.is_staff('moderator'))
  with check (public.is_community_moderator(community_id) or public.is_staff('moderator'));

-- Leave (not while banned — a ban must stick — and owners can't abandon a community), or a
-- moderator declining a request / removing a member.
create policy "leave or remove members" on public.community_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and status <> 'banned' and role <> 'owner')
    or (public.is_community_moderator(community_id) and role = 'member')
    or (public.community_role_of(community_id) = 'owner' and role <> 'owner')
    or public.is_staff('moderator')
  );

create policy "threads readable with the community" on public.community_threads
  for select to authenticated
  using (
    public.can_view_community_content(community_id)
    and (public.is_staff() or not public.is_blocked_between((select auth.uid()), author_id))
  );

create policy "members start threads" on public.community_threads
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_post_in_community(community_id));

create policy "authors and moderators edit threads" on public.community_threads
  for update to authenticated
  using (author_id = (select auth.uid()) or public.is_community_moderator(community_id) or public.is_staff('moderator'))
  with check (author_id = (select auth.uid()) or public.is_community_moderator(community_id) or public.is_staff('moderator'));

create policy "authors and moderators delete threads" on public.community_threads
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_community_moderator(community_id) or public.is_staff('moderator'));

create policy "replies readable with the community" on public.community_replies
  for select to authenticated
  using (
    public.can_view_community_content(public.thread_community(thread_id))
    and (public.is_staff() or not public.is_blocked_between((select auth.uid()), author_id))
  );

create policy "members reply to open threads" on public.community_replies
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_reply_to_thread(thread_id));

create policy "authors edit replies" on public.community_replies
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.can_reply_to_thread(thread_id));

create policy "authors and moderators delete replies" on public.community_replies
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_community_moderator(public.thread_community(thread_id))
    or public.is_staff('moderator')
  );

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- True when the statement comes from an API role rather than a trusted (definer) function.
create or replace function public.is_api_caller()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

-- At most five live communities per owner; the creator automatically becomes the owner.
create or replace function public.communities_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('community_owner:' || new.created_by::text, 0));
  if (select count(*) from public.communities c where c.created_by = new.created_by and c.archived_at is null) >= 5 then
    raise exception 'you can own at most 5 active communities' using errcode = 'P0001';
  end if;
  new.member_count := 0;
  return new;
end;
$$;

create trigger communities_before_insert before insert on public.communities
  for each row execute function public.communities_before_insert();

create or replace function public.communities_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_members (community_id, user_id, role, status)
  values (new.id, new.created_by, 'owner', 'active');
  return null;
end;
$$;

create trigger communities_after_insert after insert on public.communities
  for each row execute function public.communities_after_insert();

-- Keep member_count trustworthy even though owners may update the row.
create or replace function public.communities_protect_counts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_api_caller() then
    new.member_count := old.member_count;
  end if;
  return new;
end;
$$;

create trigger communities_protect_counts before update on public.communities
  for each row execute function public.communities_protect_counts();

-- Membership rules that policies alone can't express. SECURITY INVOKER on purpose: it must see
-- the real caller (current_user) to tell API writes from trusted function writes.
create or replace function public.community_members_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_visibility public.community_visibility;
  v_caller_role public.community_role;
  v_caller_is_staff boolean;
begin
  -- Rows written by trusted functions (e.g. the owner row) are accepted as given.
  if not public.is_api_caller() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select visibility into v_visibility from public.communities where id = new.community_id;
    new.role := 'member';
    new.status := case when v_visibility = 'open' then 'active' else 'pending' end;
    new.joined_at := now();
    return new;
  end if;

  -- UPDATE: approve, ban/unban, promote/demote.
  v_caller_is_staff := public.is_staff('moderator');
  v_caller_role := public.community_role_of(new.community_id);
  if old.role = 'owner' and not v_caller_is_staff then
    raise exception 'the owner''s membership cannot be changed' using errcode = 'P0001';
  end if;
  if new.role = 'owner' and old.role <> 'owner' then
    raise exception 'ownership cannot be transferred here' using errcode = 'P0001';
  end if;
  if new.role is distinct from old.role and v_caller_role is distinct from 'owner' and not v_caller_is_staff then
    raise exception 'only the owner can change roles' using errcode = 'P0001';
  end if;
  if old.role = 'moderator' and new.status is distinct from old.status and v_caller_role is distinct from 'owner' and not v_caller_is_staff then
    raise exception 'only the owner can change a moderator''s membership' using errcode = 'P0001';
  end if;
  if new.role <> 'member' and new.status <> 'active' then
    raise exception 'moderators must be active members' using errcode = 'P0001';
  end if;
  if new.status = 'active' and old.status = 'pending' then
    new.joined_at := now();
  end if;
  return new;
end;
$$;

create trigger community_members_before_write before insert or update on public.community_members
  for each row execute function public.community_members_before_write();

-- member_count = active members; notify moderators of join requests.
create or replace function public.community_members_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community uuid := coalesce(new.community_id, old.community_id);
  v_name text;
  v_slug text;
  r record;
begin
  update public.communities c
  set member_count = (select count(*) from public.community_members m where m.community_id = v_community and m.status = 'active')
  where c.id = v_community;

  if tg_op = 'INSERT' and new.status = 'pending' then
    select name, slug into v_name, v_slug from public.communities where id = v_community;
    for r in
      select user_id from public.community_members
      where community_id = v_community and status = 'active' and role in ('owner', 'moderator')
    loop
      perform public.notify(r.user_id, 'community_request', new.user_id, 'community', v_community,
        jsonb_build_object('name', v_name, 'slug', v_slug), 'community_request:' || v_community || ':' || new.user_id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger community_members_after_change after insert or update of status or delete on public.community_members
  for each row execute function public.community_members_after_change();

-- Threads: reply_count / last_activity_at are system-maintained; pin and lock are moderator-only.
create or replace function public.community_threads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_api_caller() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pinned := false;
    new.locked := false;
    new.reply_count := 0;
    new.last_activity_at := now();
    return new;
  end if;
  new.reply_count := old.reply_count;
  new.last_activity_at := old.last_activity_at;
  if (new.pinned is distinct from old.pinned or new.locked is distinct from old.locked)
     and not public.is_community_moderator(old.community_id) and not public.is_staff('moderator') then
    raise exception 'only moderators can pin or lock threads' using errcode = 'P0001';
  end if;
  if (new.title is distinct from old.title or new.body is distinct from old.body) and old.author_id <> (select auth.uid()) then
    raise exception 'only the author can edit a thread' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger community_threads_before_write before insert or update on public.community_threads
  for each row execute function public.community_threads_before_write();

-- Reply bookkeeping and the thread author's notification.
create or replace function public.community_replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.community_threads;
  v_slug text;
begin
  if tg_op = 'INSERT' then
    update public.community_threads
    set reply_count = reply_count + 1, last_activity_at = new.created_at
    where id = new.thread_id
    returning * into v_thread;
    select slug into v_slug from public.communities where id = v_thread.community_id;
    perform public.notify(v_thread.author_id, 'community_reply', new.author_id, 'community_thread', v_thread.id,
      jsonb_build_object('title', v_thread.title, 'slug', v_slug), 'community_reply:' || new.id);
  elsif tg_op = 'DELETE' then
    update public.community_threads set reply_count = greatest(reply_count - 1, 0) where id = old.thread_id;
  end if;
  return null;
end;
$$;

create trigger community_replies_after_change after insert or delete on public.community_replies
  for each row execute function public.community_replies_after_change();

-- Helpers are for policies and the app's own session; not for anonymous callers.
revoke execute on function public.community_role_of(uuid), public.is_community_member(uuid), public.is_community_moderator(uuid),
  public.can_view_community_content(uuid), public.can_post_in_community(uuid), public.can_reply_to_thread(uuid),
  public.thread_community(uuid) from public, anon;
grant execute on function public.community_role_of(uuid), public.is_community_member(uuid), public.is_community_moderator(uuid),
  public.can_view_community_content(uuid), public.can_post_in_community(uuid), public.can_reply_to_thread(uuid),
  public.thread_community(uuid) to authenticated;
revoke execute on function public.communities_before_insert(), public.communities_after_insert(), public.communities_protect_counts(),
  public.community_members_before_write(), public.community_members_after_change(), public.community_threads_before_write(),
  public.community_replies_after_change() from public, anon, authenticated;
