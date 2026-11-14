-- Storage buckets, object policies and realtime publication.
--
-- Object naming convention: every upload is stored under "<auth.uid()>/<random>.<ext>",
-- so ownership is checked from the first path segment.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('profile-media', 'profile-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('post-media', 'post-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('listing-media', 'listing-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Public-read buckets (profile-media, listing-media) are served via public URLs, which
-- bypass RLS. Listing media for members-only listings therefore uses unguessable paths;
-- see docs/SECURITY_THREAT_MODEL.md (T-08).

create policy "owners upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('profile-media', 'post-media', 'listing-media', 'verification-documents')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owners update own objects"
  on storage.objects for update to authenticated
  using (bucket_id in ('profile-media', 'listing-media') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners delete own objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('profile-media', 'post-media', 'listing-media', 'verification-documents')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Private post media is readable by its owner and by anyone allowed to see the post
-- (post_media's select policy defers to the posts policy).
create policy "post media readable with post"
  on storage.objects for select
  using (
    bucket_id = 'post-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.post_media pm where pm.storage_path = name)
    )
  );

create policy "verification documents readable by owner and staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff('moderator'))
  );

-- ---------------------------------------------------------------------------
-- Realtime: private broadcast channels authorized by RLS on realtime.messages.
--
-- Topics:
--   user:<uuid>          -> only that user (notifications, inbox and connection updates)
--   conversation:<uuid>  -> only conversation participants (messages, read receipts, typing/presence)
--
-- Events are broadcast from AFTER triggers, i.e. only once the durable row exists in the same
-- transaction; Realtime delivers them after commit. Broadcast failures never roll back the write:
-- clients reconcile from Postgres on (re)connect. See docs/ARCHITECTURE.md Â§Realtime.
-- ---------------------------------------------------------------------------
create or replace function public.realtime_topic_allowed(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_id text;
begin
  if auth.uid() is null or p_topic is null then
    return false;
  end if;
  if p_topic like 'user:%' then
    return substr(p_topic, 6) = auth.uid()::text;
  elsif p_topic like 'conversation:%' then
    v_id := substr(p_topic, 14);
    return v_id ~ v_uuid_re and public.is_conversation_participant(v_id::uuid);
  end if;
  return false;
end;
$$;

create policy "authorized private topics can be received"
  on realtime.messages for select to authenticated
  using (public.realtime_topic_allowed(realtime.topic()));

-- Clients may only send ephemeral typing/presence events, and only into conversations they belong to.
create policy "participants send typing and presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'conversation:%'
    and public.realtime_topic_allowed(realtime.topic())
    and extension in ('broadcast', 'presence')
  );

create or replace function public.safe_broadcast(p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  -- Realtime unavailable: the durable record is already written; clients reconcile on reconnect.
  raise warning 'realtime broadcast failed for %: %', p_event, sqlerrm;
end;
$$;

create or replace function public.broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid;
begin
  if tg_table_name = 'messages' then
    perform public.safe_broadcast('conversation:' || new.conversation_id, 'message.created', jsonb_build_object(
      'id', new.id, 'conversation_id', new.conversation_id, 'sender_id', new.sender_id,
      'body', new.body, 'client_id', new.client_id, 'created_at', new.created_at));
    for v_other in
      select cp.user_id from public.conversation_participants cp
      where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id
    loop
      perform public.safe_broadcast('user:' || v_other, 'inbox.updated',
        jsonb_build_object('conversation_id', new.conversation_id));
    end loop;
  elsif tg_table_name = 'conversation_participants' then
    if new.last_read_at is distinct from old.last_read_at then
      perform public.safe_broadcast('conversation:' || new.conversation_id, 'conversation.read',
        jsonb_build_object('user_id', new.user_id, 'last_read_at', new.last_read_at));
    end if;
  elsif tg_table_name = 'notifications' then
    perform public.safe_broadcast('user:' || new.user_id, 'notification.created',
      jsonb_build_object('id', new.id, 'type', new.type, 'created_at', new.created_at));
  elsif tg_table_name = 'connections' then
    perform public.safe_broadcast('user:' || new.requester_id, 'connection.updated',
      jsonb_build_object('id', new.id, 'status', new.status));
    perform public.safe_broadcast('user:' || new.addressee_id, 'connection.updated',
      jsonb_build_object('id', new.id, 'status', new.status));
  end if;
  return null;
end;
$$;

create trigger messages_broadcast after insert on public.messages
  for each row execute function public.broadcast_changes();
create trigger conversation_participants_broadcast after update of last_read_at on public.conversation_participants
  for each row execute function public.broadcast_changes();
create trigger notifications_broadcast after insert on public.notifications
  for each row execute function public.broadcast_changes();
create trigger connections_broadcast after insert or update on public.connections
  for each row execute function public.broadcast_changes();

revoke execute on function public.safe_broadcast(text, text, jsonb) from public, anon, authenticated;
