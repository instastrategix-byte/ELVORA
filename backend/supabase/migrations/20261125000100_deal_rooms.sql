-- Deal rooms: private, invite-only workspaces for a deal — documents, a discussion thread, an
-- optional NDA gate and an access log.
--
-- Access model
--   * A member row is created by an invitation. Until the invitee accepts (and, when the room
--     requires one, accepts the current NDA version) they have NO access: they can only read their
--     invitation (room name + NDA) through deal_room_invitations().
--   * "Full access" = joined, and NDA accepted at the room's current version when required.
--     Changing the NDA text bumps the version, so everyone except the owner must accept it again.
--   * Roles: owner > admin > member > viewer. Viewers are read-only. Closed and archived rooms are
--     read-only for everyone.
--   * Invitations only go to the inviter's own accepted connections.
--   * Removing a member deletes their row, which revokes access immediately (every check reads it).
--
-- Discussion uses its own table rather than the direct-messaging tables: room access (roles,
-- NDA gate, closed rooms) is different from conversation participation, and a removed member must
-- lose the history too, which conversations don't do.
--
-- Files: private bucket "deal-room-files", objects named <room>/<uploader>/<uuid>.<ext>.
--   * Upload: storage insert policy requires full access with write rights in an open room, into
--     the caller's own folder. A document row is then registered by add_deal_room_document(),
--     which trusts Storage's recorded size/type over the client's claim.
--   * Read: there is no way to read a file without being logged. open_deal_room_document() checks
--     access, writes the access-log row and returns the path; the storage select policy only
--     allows reading a path the caller has opened in the last 5 minutes. The server then issues a
--     short-lived signed URL with the member's own (RLS-bound) client.
--
-- Not gated on a plan feature: no existing feature fits, so every active member can use deal
-- rooms. Gate later by adding a feature to plans and a has_feature() check in create_deal_room.

alter type public.notification_type add value if not exists 'deal_room_invite';
alter type public.notification_type add value if not exists 'deal_room_document';

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.deal_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 120),
  description text check (description is null or char_length(description) <= 2000),
  nda_required boolean not null default false,
  nda_text text check (nda_text is null or char_length(nda_text) between 20 and 20000),
  nda_version int not null default 1 check (nda_version >= 1),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not nda_required or nda_text is not null)
);
create index deal_rooms_owner_idx on public.deal_rooms (owner_id);

create table public.deal_room_members (
  room_id uuid not null references public.deal_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  nda_accepted_at timestamptz,
  nda_version_accepted int,
  -- md5 of the exact NDA text accepted, so the record shows what was agreed to.
  nda_text_hash text,
  primary key (room_id, user_id)
);
create index deal_room_members_user_idx on public.deal_room_members (user_id);
create unique index deal_room_members_one_owner on public.deal_room_members (room_id) where role = 'owner';

create table public.deal_room_documents (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  -- Documents with the same (case-insensitive) name form a version history.
  document_key text not null,
  version int not null default 1 check (version >= 1),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  unique (room_id, document_key, version)
);
create index deal_room_documents_room_idx on public.deal_room_documents (room_id, created_at desc);

create table public.deal_room_access_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.deal_rooms (id) on delete cascade,
  document_id uuid not null references public.deal_room_documents (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('view', 'download')),
  created_at timestamptz not null default now()
);
create index deal_room_access_log_room_idx on public.deal_room_access_log (room_id, created_at desc);
create index deal_room_access_log_user_doc_idx on public.deal_room_access_log (user_id, document_id, created_at desc);

create table public.deal_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.deal_rooms (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index deal_room_messages_room_idx on public.deal_room_messages (room_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------------------------
-- The caller's role in a room when they have full access (joined + current NDA), else null.
create or replace function public.deal_room_role(p_room uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.deal_room_members m
  join public.deal_rooms r on r.id = m.room_id
  where m.room_id = p_room
    and m.user_id = (select auth.uid())
    and m.joined_at is not null
    and (not r.nda_required or m.role = 'owner' or m.nda_version_accepted = r.nda_version)
    and public.is_active_member((select auth.uid()));
$$;

-- Full access with write rights (owner/admin/member) in an open room.
create or replace function public.deal_room_can_write(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.deal_room_role(p_room) in ('owner', 'admin', 'member'), false)
    and exists (select 1 from public.deal_rooms r where r.id = p_room and r.status = 'open');
$$;

revoke execute on function public.deal_room_role(uuid) from public, anon;
revoke execute on function public.deal_room_can_write(uuid) from public, anon;
grant execute on function public.deal_room_role(uuid) to authenticated;
grant execute on function public.deal_room_can_write(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.deal_rooms enable row level security;
alter table public.deal_room_members enable row level security;
alter table public.deal_room_documents enable row level security;
alter table public.deal_room_access_log enable row level security;
alter table public.deal_room_messages enable row level security;

revoke all on public.deal_rooms, public.deal_room_members, public.deal_room_documents,
  public.deal_room_access_log, public.deal_room_messages from anon, authenticated;
grant select on public.deal_rooms, public.deal_room_members, public.deal_room_documents,
  public.deal_room_access_log, public.deal_room_messages to authenticated;
-- The only direct write: posting to the discussion (author is forced to the caller).
grant insert (room_id, body) on public.deal_room_messages to authenticated;

create policy "deal rooms: members with access read" on public.deal_rooms
  for select to authenticated
  using (public.deal_room_role(id) is not null);

-- Members see the joined members; owners/admins also see pending invitations; everyone sees
-- their own row (so an invitee knows they were invited).
create policy "deal room members: read" on public.deal_room_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (joined_at is not null and public.deal_room_role(room_id) is not null)
    or public.deal_room_role(room_id) in ('owner', 'admin')
  );

create policy "deal room documents: members with access read" on public.deal_room_documents
  for select to authenticated
  using (deleted_at is null and public.deal_room_role(room_id) is not null);

create policy "deal room access log: owners and admins read" on public.deal_room_access_log
  for select to authenticated
  using (public.deal_room_role(room_id) in ('owner', 'admin'));

create policy "deal room messages: members with access read" on public.deal_room_messages
  for select to authenticated
  using (public.deal_room_role(room_id) is not null);

create policy "deal room messages: writers post" on public.deal_room_messages
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.deal_room_can_write(room_id));

-- The access log is append-only: nobody (not even the owner) can rewrite history.
create or replace function public.deal_room_access_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The access log cannot be changed' using errcode = '42501';
end;
$$;
create trigger deal_room_access_log_no_update before update on public.deal_room_access_log
  for each row execute function public.deal_room_access_log_immutable();

-- ---------------------------------------------------------------------------------------------
-- Room lifecycle
-- ---------------------------------------------------------------------------------------------
create or replace function public.create_deal_room(p_name text, p_description text, p_nda_required boolean, p_nda_text text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_nda text := nullif(btrim(coalesce(p_nda_text, '')), '');
  v_recent int;
begin
  if v_me is null or not public.is_active_member(v_me) then
    raise exception 'Only active members can create deal rooms' using errcode = '42501';
  end if;
  if coalesce(p_nda_required, false) and v_nda is null then
    raise exception 'Add the NDA text members must accept' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.deal_rooms where owner_id = v_me and created_at > now() - interval '1 day';
  if v_recent >= 20 then
    raise exception 'You have created too many deal rooms today' using errcode = 'P0001';
  end if;
  insert into public.deal_rooms (owner_id, name, description, nda_required, nda_text)
  values (v_me, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_nda_required, false), v_nda)
  returning id into v_id;
  insert into public.deal_room_members (room_id, user_id, role, invited_by, joined_at, nda_accepted_at, nda_version_accepted, nda_text_hash)
  values (v_id, v_me, 'owner', v_me, now(), case when v_nda is not null then now() end, 1, case when v_nda is not null then md5(v_nda) end);
  return v_id;
end;
$$;

-- Owner/admin edit. Changing the NDA (text or turning it on) bumps the version so every
-- non-owner member must accept the new terms before seeing anything again.
create or replace function public.update_deal_room(p_room uuid, p_name text, p_description text, p_nda_required boolean, p_nda_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.deal_rooms;
  v_role text := public.deal_room_role(p_room);
  v_nda text := nullif(btrim(coalesce(p_nda_text, '')), '');
  v_required boolean := coalesce(p_nda_required, false);
  v_changed boolean;
begin
  select * into r from public.deal_rooms where id = p_room for update;
  if not found or v_role is null then
    raise exception 'Deal room not found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can edit this room' using errcode = '42501';
  end if;
  if r.status <> 'open' then
    raise exception 'This room is closed' using errcode = 'P0001';
  end if;
  if v_required and v_nda is null then
    raise exception 'Add the NDA text members must accept' using errcode = '22023';
  end if;
  v_changed := v_required and (not r.nda_required or r.nda_text is distinct from v_nda);
  update public.deal_rooms set
    name = btrim(p_name),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    nda_required = v_required,
    nda_text = coalesce(v_nda, case when v_required then r.nda_text end),
    nda_version = case when v_changed then r.nda_version + 1 else r.nda_version end,
    updated_at = now()
  where id = p_room;
  if v_changed then
    -- The owner is the party offering the terms.
    update public.deal_room_members
      set nda_accepted_at = now(), nda_version_accepted = r.nda_version + 1, nda_text_hash = md5(v_nda)
      where room_id = p_room and role = 'owner';
  end if;
end;
$$;

create or replace function public.set_deal_room_status(p_room uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.deal_room_role(p_room) is distinct from 'owner' then
    raise exception 'Only the owner can change the room status' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed', 'archived') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.deal_rooms set status = p_status, updated_at = now() where id = p_room;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------------------------
create or replace function public.invite_to_deal_room(p_room uuid, p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_role text := public.deal_room_role(p_room);
  r public.deal_rooms;
begin
  select * into r from public.deal_rooms where id = p_room;
  if not found or v_role is null then
    raise exception 'Deal room not found' using errcode = 'P0002';
  end if;
  if v_role not in ('owner', 'admin') then
    raise exception 'Only the owner or an admin can invite people' using errcode = '42501';
  end if;
  if r.status <> 'open' then
    raise exception 'This room is closed' using errcode = 'P0001';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  if p_role = 'admin' and v_role <> 'owner' then
    raise exception 'Only the owner can invite admins' using errcode = '42501';
  end if;
  if p_user is null or p_user = v_me then
    raise exception 'Invalid member' using errcode = '22023';
  end if;
  -- Invitations go only to the inviter's own connections.
  if not exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = v_me and c.addressee_id = p_user) or (c.requester_id = p_user and c.addressee_id = v_me))
  ) then
    raise exception 'You can only invite your connections' using errcode = '42501';
  end if;
  if public.is_blocked_between(v_me, p_user) or not public.is_active_member(p_user) then
    raise exception 'This member cannot be invited' using errcode = '42501';
  end if;
  if exists (select 1 from public.deal_room_members where room_id = p_room and user_id = p_user) then
    raise exception 'This member is already in the room or invited' using errcode = 'P0001';
  end if;
  insert into public.deal_room_members (room_id, user_id, role, invited_by) values (p_room, p_user, p_role, v_me);
  perform public.notify(p_user, 'deal_room_invite', v_me, 'deal_room', p_room,
    jsonb_build_object('name', r.name));
end;
$$;

-- Pending invitations and NDA re-acceptances for the caller: the only thing an invitee can see.
create or replace function public.deal_room_invitations()
returns table (
  room_id uuid, name text, owner_id uuid, invited_by uuid, role text, invited_at timestamptz,
  nda_required boolean, nda_text text, nda_version int, rejoin boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.owner_id, m.invited_by, m.role, m.invited_at,
         r.nda_required, case when r.nda_required then r.nda_text end, r.nda_version,
         m.joined_at is not null
  from public.deal_room_members m
  join public.deal_rooms r on r.id = m.room_id
  where m.user_id = (select auth.uid())
    and r.status <> 'archived'
    and (m.joined_at is null or (r.nda_required and m.role <> 'owner' and m.nda_version_accepted is distinct from r.nda_version))
  order by m.invited_at desc;
$$;

-- Accept an invitation (or a changed NDA). p_nda_version must be the version shown to the member,
-- so nobody accepts terms they haven't seen.
create or replace function public.join_deal_room(p_room uuid, p_nda_version int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  r public.deal_rooms;
  m public.deal_room_members;
begin
  select * into m from public.deal_room_members where room_id = p_room and user_id = v_me for update;
  select * into r from public.deal_rooms where id = p_room;
  if m.user_id is null or r.id is null or r.status = 'archived' or not public.is_active_member(v_me) then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if r.nda_required and p_nda_version is distinct from r.nda_version then
    raise exception 'The NDA has changed. Please read the current version.' using errcode = 'P0001';
  end if;
  update public.deal_room_members set
    joined_at = coalesce(joined_at, now()),
    nda_accepted_at = case when r.nda_required then now() else nda_accepted_at end,
    nda_version_accepted = case when r.nda_required then r.nda_version else nda_version_accepted end,
    nda_text_hash = case when r.nda_required then md5(r.nda_text) else nda_text_hash end
  where room_id = p_room and user_id = v_me;
end;
$$;

-- Decline an invitation or leave a room. The owner can't leave (archive the room instead).
create or replace function public.leave_deal_room(p_room uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.deal_room_members where room_id = p_room and user_id = auth.uid() and role = 'owner') then
    raise exception 'The owner cannot leave the room' using errcode = '42501';
  end if;
  delete from public.deal_room_members where room_id = p_room and user_id = auth.uid();
end;
$$;

-- Owner removes anyone but themselves; admins remove members and viewers.
create or replace function public.remove_deal_room_member(p_room uuid, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text := public.deal_room_role(p_room);
  v_target text;
begin
  select role into v_target from public.deal_room_members where room_id = p_room and user_id = p_user;
  if v_role is null or v_target is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if v_target = 'owner' then
    raise exception 'The owner cannot be removed' using errcode = '42501';
  end if;
  if not (v_role = 'owner' or (v_role = 'admin' and v_target in ('member', 'viewer'))) then
    raise exception 'You cannot remove this member' using errcode = '42501';
  end if;
  delete from public.deal_room_members where room_id = p_room and user_id = p_user;
end;
$$;

create or replace function public.set_deal_room_member_role(p_room uuid, p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.deal_room_role(p_room) is distinct from 'owner' then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;
  update public.deal_room_members set role = p_role where room_id = p_room and user_id = p_user and role <> 'owner';
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------------------------
create or replace function public.deal_room_file_type_allowed(p_mime text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mime in (
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp'
  );
$$;

create or replace function public.add_deal_room_document(p_room uuid, p_path text, p_file_name text, p_mime text, p_size bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_object storage.objects;
  v_name text := left(coalesce(nullif(btrim(p_file_name), ''), 'document'), 200);
  v_key text;
  v_version int;
  v_id uuid;
  v_room_name text;
  v_member uuid;
begin
  if not public.deal_room_can_write(p_room) then
    raise exception 'You cannot upload to this room' using errcode = '42501';
  end if;
  if p_path is null or p_path !~ ('^' || p_room::text || '/' || v_me::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception 'The file is not in your upload folder' using errcode = '42501';
  end if;
  if not public.deal_room_file_type_allowed(lower(coalesce(p_mime, ''))) then
    raise exception 'This file type is not allowed' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or p_size > 52428800 then
    raise exception 'Files can be up to 50 MB' using errcode = '22023';
  end if;
  select * into v_object from storage.objects o where o.bucket_id = 'deal-room-files' and o.name = p_path;
  if not found then
    raise exception 'Upload not found — please try again' using errcode = 'P0002';
  end if;
  if v_object.metadata is not null then
    if (v_object.metadata->>'size') is not null and (v_object.metadata->>'size')::bigint <> p_size then
      raise exception 'File size does not match the upload' using errcode = '22023';
    end if;
    if (v_object.metadata->>'mimetype') is not null and lower(v_object.metadata->>'mimetype') <> lower(p_mime) then
      raise exception 'File type does not match the upload' using errcode = '22023';
    end if;
  end if;
  v_key := lower(v_name);
  -- Serialise versions of the same document.
  perform pg_advisory_xact_lock(hashtext(p_room::text || '/' || v_key));
  select coalesce(max(version), 0) + 1 into v_version from public.deal_room_documents where room_id = p_room and document_key = v_key;
  insert into public.deal_room_documents (room_id, storage_path, file_name, document_key, version, mime_type, size_bytes, uploaded_by)
  values (p_room, p_path, v_name, v_key, v_version, lower(p_mime), p_size, v_me)
  returning id into v_id;

  select name into v_room_name from public.deal_rooms where id = p_room;
  for v_member in
    select m.user_id from public.deal_room_members m
    join public.deal_rooms r on r.id = m.room_id
    where m.room_id = p_room and m.user_id <> v_me and m.joined_at is not null
      and (not r.nda_required or m.role = 'owner' or m.nda_version_accepted = r.nda_version)
  loop
    perform public.notify(v_member, 'deal_room_document', v_me, 'deal_room', p_room,
      jsonb_build_object('name', v_room_name, 'file', v_name), 'deal_room_document:' || v_id::text);
  end loop;
  return v_id;
end;
$$;

-- Uploader, owner or admin can remove a document (soft delete; the file stays for the record
-- but can no longer be opened).
create or replace function public.remove_deal_room_document(p_document uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.deal_room_documents;
  v_role text;
begin
  select * into d from public.deal_room_documents where id = p_document and deleted_at is null;
  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  v_role := public.deal_room_role(d.room_id);
  if v_role is null or not public.deal_room_can_write(d.room_id) then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if not (v_role in ('owner', 'admin') or d.uploaded_by = auth.uid()) then
    raise exception 'You cannot remove this document' using errcode = '42501';
  end if;
  update public.deal_room_documents set deleted_at = now(), deleted_by = auth.uid() where id = p_document;
end;
$$;

-- Logs a view/download and returns the storage path to sign. This is the only way to read a file.
create or replace function public.open_deal_room_document(p_document uuid, p_action text)
returns table (storage_path text, file_name text, mime_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d public.deal_room_documents;
begin
  if p_action not in ('view', 'download') then
    raise exception 'Invalid action' using errcode = '22023';
  end if;
  select * into d from public.deal_room_documents where id = p_document and deleted_at is null;
  if not found or public.deal_room_role(d.room_id) is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  insert into public.deal_room_access_log (room_id, document_id, user_id, action) values (d.room_id, d.id, auth.uid(), p_action);
  return query select d.storage_path, d.file_name, d.mime_type;
end;
$$;

-- Storage read check: full access + the caller opened (and so logged) this file very recently.
create or replace function public.deal_room_file_readable(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deal_room_documents d
    where d.storage_path = p_name and d.deleted_at is null
      and public.deal_room_role(d.room_id) is not null
      and exists (
        select 1 from public.deal_room_access_log l
        where l.document_id = d.id and l.user_id = (select auth.uid()) and l.created_at > now() - interval '5 minutes'
      )
  );
$$;

-- Storage upload check: own folder in a room the caller can write to.
create or replace function public.deal_room_upload_allowed(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_room uuid;
begin
  if auth.uid() is null or array_length(v_parts, 1) <> 3 or p_name like '%..%' then
    return false;
  end if;
  begin
    v_room := v_parts[1]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v_parts[2] = auth.uid()::text and public.deal_room_can_write(v_room);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants on functions
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.create_deal_room(text, text, boolean, text) from public, anon;
revoke execute on function public.update_deal_room(uuid, text, text, boolean, text) from public, anon;
revoke execute on function public.set_deal_room_status(uuid, text) from public, anon;
revoke execute on function public.invite_to_deal_room(uuid, uuid, text) from public, anon;
revoke execute on function public.deal_room_invitations() from public, anon;
revoke execute on function public.join_deal_room(uuid, int) from public, anon;
revoke execute on function public.leave_deal_room(uuid) from public, anon;
revoke execute on function public.remove_deal_room_member(uuid, uuid) from public, anon;
revoke execute on function public.set_deal_room_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.add_deal_room_document(uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.remove_deal_room_document(uuid) from public, anon;
revoke execute on function public.open_deal_room_document(uuid, text) from public, anon;
revoke execute on function public.deal_room_file_readable(text) from public, anon;
revoke execute on function public.deal_room_upload_allowed(text) from public, anon;
revoke execute on function public.deal_room_access_log_immutable() from public, anon, authenticated;

grant execute on function public.create_deal_room(text, text, boolean, text) to authenticated;
grant execute on function public.update_deal_room(uuid, text, text, boolean, text) to authenticated;
grant execute on function public.set_deal_room_status(uuid, text) to authenticated;
grant execute on function public.invite_to_deal_room(uuid, uuid, text) to authenticated;
grant execute on function public.deal_room_invitations() to authenticated;
grant execute on function public.join_deal_room(uuid, int) to authenticated;
grant execute on function public.leave_deal_room(uuid) to authenticated;
grant execute on function public.remove_deal_room_member(uuid, uuid) to authenticated;
grant execute on function public.set_deal_room_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.add_deal_room_document(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remove_deal_room_document(uuid) to authenticated;
grant execute on function public.open_deal_room_document(uuid, text) to authenticated;
grant execute on function public.deal_room_file_readable(text) to authenticated;
grant execute on function public.deal_room_upload_allowed(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'deal-room-files', 'deal-room-files', false, 52428800,
  array[
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "deal room files: writers upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-room-files' and public.deal_room_upload_allowed(name));

create policy "deal room files: read after logged open"
  on storage.objects for select to authenticated
  using (bucket_id = 'deal-room-files' and public.deal_room_file_readable(name));

-- An uploader may delete their own file only until it is registered as a document.
create policy "deal room files: uploader deletes unregistered"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'deal-room-files'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not exists (select 1 from public.deal_room_documents d where d.storage_path = name)
  );
