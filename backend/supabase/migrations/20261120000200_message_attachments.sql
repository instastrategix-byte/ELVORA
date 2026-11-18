-- Message attachments: photos, videos and documents shared inside conversations.
--
-- Storage: private bucket "message-attachments". Objects are named
--   <conversation_id>/<sender_id>/<uuid>.<ext>
-- so access is decided from the path: only participants of the conversation can read, and a
-- participant can only upload into their own sender folder. Files are served exclusively through
-- short-lived signed URLs.
--
-- Sending: text-only messages keep the existing direct-insert path (and its RLS policy). Messages
-- with attachments go through send_message_with_attachments(), which validates every file against
-- the stored object (path, owner folder, size, type) and writes the message and its attachments
-- atomically. Clients cannot insert attachment rows directly.

-- ---------------------------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'message-attachments', 'message-attachments', false, 26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain', 'text/csv', 'application/rtf'
  ]
)
on conflict (id) do nothing;

-- Allowed types and per-kind size limits (mirrors backend/src/modules/messaging/attachments.ts).
create or replace function public.message_attachment_kind(p_mime text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif') then 'image'
    when p_mime in ('video/mp4', 'video/webm', 'video/quicktime') then 'video'
    when p_mime in (
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
      'text/plain', 'text/csv', 'application/rtf'
    ) then 'document'
    else null
  end;
$$;

create or replace function public.message_attachment_max_bytes(p_kind text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'image' then 15728640 when 'video' then 26214400 when 'document' then 26214400 else 0 end;
$$;

-- Parses "<conversation>/<sender>/<file>" and checks the caller may use that folder.
-- p_for_write: the caller must be the sender folder's owner and allowed to send messages.
create or replace function public.message_attachment_path_allowed(p_name text, p_for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_conversation uuid;
  v_sender uuid;
  v_me uuid := auth.uid();
begin
  if v_me is null or array_length(v_parts, 1) <> 3 or p_name like '%..%' then
    return false;
  end if;
  begin
    v_conversation := v_parts[1]::uuid;
    v_sender := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not exists (
    select 1 from public.conversation_participants cp where cp.conversation_id = v_conversation and cp.user_id = v_me
  ) then
    return false;
  end if;
  if p_for_write then
    return v_sender = v_me and public.has_feature('messages.send');
  end if;
  return true;
end;
$$;

revoke execute on function public.message_attachment_path_allowed(text, boolean) from public, anon;
grant execute on function public.message_attachment_path_allowed(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Messages: allow attachment-only messages
-- ---------------------------------------------------------------------------------------------
alter table public.messages add column has_attachments boolean not null default false;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000 and (has_attachments or char_length(btrim(body)) > 0));
-- has_attachments is not in the column-level insert grant, so direct inserts are always text-only.

-- ---------------------------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------------------------
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  kind text not null check (kind in ('image', 'video', 'document')),
  width int check (width is null or width between 1 and 20000),
  height int check (height is null or height between 1 and 20000),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index message_attachments_message_idx on public.message_attachments (message_id, position);
create index message_attachments_conversation_idx on public.message_attachments (conversation_id, created_at desc);

alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;

create policy "participants read message attachments" on public.message_attachments
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

-- ---------------------------------------------------------------------------------------------
-- Storage policies (bucket-specific; the generic "own folder" policies don't cover this bucket)
-- ---------------------------------------------------------------------------------------------
create policy "message attachments: participants upload to own sender folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments' and public.message_attachment_path_allowed(name, true));

create policy "message attachments: participants read"
  on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments' and public.message_attachment_path_allowed(name, false));

-- An uploader may delete their own file only until it has been sent (e.g. removed from the tray).
create policy "message attachments: uploader deletes unsent"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not exists (select 1 from public.message_attachments ma where ma.storage_path = name)
  );
-- No update policy: attachments are immutable.

-- ---------------------------------------------------------------------------------------------
-- Send with attachments
-- ---------------------------------------------------------------------------------------------
create or replace function public.send_message_with_attachments(
  p_conversation uuid,
  p_client_id uuid,
  p_body text,
  p_attachments jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_body text := coalesce(btrim(p_body), '');
  v_existing public.messages;
  v_id uuid;
  v_count int;
  v_item jsonb;
  v_path text;
  v_mime text;
  v_kind text;
  v_size bigint;
  v_object storage.objects;
  v_position int := 0;
  v_created timestamptz;
begin
  if v_me is null then
    raise exception 'Sign in to send messages' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation and user_id = v_me) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if not public.has_feature('messages.send') then
    raise exception 'Your membership does not include messaging' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.conversation_participants o
    where o.conversation_id = p_conversation and o.user_id <> v_me
      and (public.is_blocked_between(v_me, o.user_id) or not public.is_active_member(o.user_id))
  ) then
    raise exception 'You can no longer message this member' using errcode = '42501';
  end if;

  -- Idempotent retries: the same client id returns the stored message.
  select * into v_existing from public.messages where sender_id = v_me and client_id = p_client_id;
  if found then
    if v_existing.conversation_id <> p_conversation then
      raise exception 'Duplicate message id' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

  if jsonb_typeof(p_attachments) is distinct from 'array' then
    raise exception 'Invalid attachments' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_attachments);
  if v_count < 1 or v_count > 10 then
    raise exception 'Attach between 1 and 10 files' using errcode = '22023';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Message is too long' using errcode = '22001';
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_id, has_attachments)
  values (p_conversation, v_me, v_body, p_client_id, true)
  returning id, created_at into v_id, v_created;

  for v_item in select * from jsonb_array_elements(p_attachments) loop
    v_path := v_item->>'path';
    v_mime := lower(coalesce(v_item->>'mimeType', ''));
    v_kind := public.message_attachment_kind(v_mime);
    v_size := (v_item->>'size')::bigint;
    if v_path is null or v_path !~ ('^' || p_conversation::text || '/' || v_me::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
      raise exception 'Attachment is not in your upload folder' using errcode = '42501';
    end if;
    if v_kind is null then
      raise exception 'This file type is not allowed' using errcode = '22023';
    end if;
    if v_size is null or v_size <= 0 or v_size > public.message_attachment_max_bytes(v_kind) then
      raise exception 'This file is too large' using errcode = '22023';
    end if;
    select * into v_object from storage.objects o where o.bucket_id = 'message-attachments' and o.name = v_path;
    if not found then
      raise exception 'Upload not found — please try again' using errcode = 'P0002';
    end if;
    -- Trust what Storage recorded over what the client claims.
    if v_object.metadata is not null then
      if (v_object.metadata->>'size') is not null and (v_object.metadata->>'size')::bigint <> v_size then
        raise exception 'Attachment size does not match the upload' using errcode = '22023';
      end if;
      if (v_object.metadata->>'mimetype') is not null and lower(v_object.metadata->>'mimetype') <> v_mime then
        raise exception 'Attachment type does not match the upload' using errcode = '22023';
      end if;
    end if;
    insert into public.message_attachments (message_id, conversation_id, storage_path, file_name, mime_type, size_bytes, kind, width, height, position)
    values (
      v_id, p_conversation, v_path,
      left(coalesce(nullif(btrim(v_item->>'fileName'), ''), 'attachment'), 200),
      v_mime, v_size, v_kind,
      nullif(v_item->>'width', '')::int, nullif(v_item->>'height', '')::int,
      v_position
    );
    v_position := v_position + 1;
  end loop;

  -- The insert's own broadcast fires before attachments exist; tell clients to refresh this message.
  perform public.safe_broadcast('conversation:' || p_conversation, 'message.updated',
    jsonb_build_object('id', v_id, 'client_id', p_client_id, 'conversation_id', p_conversation));
  return v_id;
end;
$$;

revoke execute on function public.send_message_with_attachments(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.send_message_with_attachments(uuid, uuid, text, jsonb) to authenticated;
