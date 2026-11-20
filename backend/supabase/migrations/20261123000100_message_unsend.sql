-- Unsend: a sender can take back their own message within 10 minutes of sending it.
--
-- The message row is kept as a tombstone (so ordering, read state and realtime reconciliation
-- stay consistent) but its content is wiped: body cleared, attachments and reactions removed.
-- Participants then see "Message unsent" in its place. The 10-minute window is measured with the
-- database clock against the stored created_at, never a client time.
--
-- Users still have no UPDATE privilege on messages: the only way to change a sent message is
-- unsend_message(), which checks sender, window and participation.

alter table public.messages add column unsent_at timestamptz;

-- An unsent tombstone has an empty body and no attachments.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (unsent_at is not null or has_attachments or char_length(btrim(body)) > 0)
  );
alter table public.messages add constraint messages_unsent_empty
  check (unsent_at is null or (body = '' and not has_attachments));

-- ---------------------------------------------------------------------------------------------
-- unsend_message
-- ---------------------------------------------------------------------------------------------
-- Returns the storage paths of the attachments it removed. The caller (the API, acting as the
-- sender) then deletes those objects from the private bucket: once the attachment rows are gone,
-- the existing "uploader deletes unsent" storage policy lets the uploader remove their own files.
create or replace function public.unsend_message(p_message uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_msg public.messages;
  v_paths text[];
  v_other uuid;
begin
  if v_me is null then
    raise exception 'Sign in to manage your messages' using errcode = '42501';
  end if;

  select * into v_msg from public.messages where id = p_message for update;
  if not found or not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = v_msg.conversation_id and cp.user_id = v_me
  ) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  if v_msg.sender_id <> v_me then
    raise exception 'You can only unsend your own messages' using errcode = '42501';
  end if;

  -- Idempotent: unsending twice is a no-op.
  if v_msg.unsent_at is not null then
    return array[]::text[];
  end if;

  if now() - v_msg.created_at > interval '10 minutes' then
    raise exception 'Messages can only be unsent within 10 minutes of sending' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(storage_path order by position), array[]::text[]) into v_paths
  from public.message_attachments where message_id = p_message;

  delete from public.message_reactions where message_id = p_message;
  delete from public.message_attachments where message_id = p_message;
  update public.messages
    set body = '', has_attachments = false, unsent_at = now()
    where id = p_message;

  -- Withdraw unread "new message" notifications that no longer point at anything unread.
  delete from public.notifications n
  using public.conversation_participants cp
  where cp.conversation_id = v_msg.conversation_id
    and cp.user_id <> v_me
    and n.user_id = cp.user_id
    and n.type = 'message'
    and n.entity_id = v_msg.conversation_id
    and n.read_at is null
    and not exists (
      select 1 from public.messages m
      where m.conversation_id = v_msg.conversation_id
        and m.sender_id <> cp.user_id
        and m.unsent_at is null
        and (cp.last_read_at is null or m.created_at > cp.last_read_at)
    );

  perform public.safe_broadcast('conversation:' || v_msg.conversation_id, 'message.unsent',
    jsonb_build_object('id', v_msg.id, 'client_id', v_msg.client_id, 'conversation_id', v_msg.conversation_id));
  for v_other in
    select cp.user_id from public.conversation_participants cp
    where cp.conversation_id = v_msg.conversation_id and cp.user_id <> v_me
  loop
    perform public.safe_broadcast('user:' || v_other, 'inbox.updated',
      jsonb_build_object('conversation_id', v_msg.conversation_id));
  end loop;

  return v_paths;
end;
$$;

revoke execute on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Conversation list: report unsent last messages, and don't count them as unread.
-- The return type changes, so the function is dropped and recreated.
-- ---------------------------------------------------------------------------------------------
drop function if exists public.conversation_summaries(integer, timestamptz);

create function public.conversation_summaries(p_limit integer default 30, p_before timestamptz default null)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender uuid,
  unread_count bigint,
  last_message_unsent boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    other.user_id,
    c.last_message_at,
    lm.body,
    lm.sender_id,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> (select auth.uid())
        and m.unsent_at is null
        and (me.last_read_at is null or m.created_at > me.last_read_at)),
    coalesce(lm.unsent_at is not null, false)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select m.body, m.sender_id, m.unsent_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and (select auth.uid()) is not null
    and c.last_message_at is not null
    and (p_before is null or c.last_message_at < p_before)
  order by c.last_message_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.conversation_summaries(integer, timestamptz) from public, anon;
grant execute on function public.conversation_summaries(integer, timestamptz) to authenticated;

-- Reactions can't be added to an unsent message.
drop policy if exists "participants react" on public.message_reactions;
create policy "participants react" on public.message_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_member((select auth.uid()))
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.unsent_at is null
        and public.is_conversation_participant(m.conversation_id)
        and not exists (
          select 1 from public.conversation_participants o
          where o.conversation_id = m.conversation_id and o.user_id <> (select auth.uid())
            and public.is_blocked_between((select auth.uid()), o.user_id)
        )
    )
  );
