-- Message reactions (emoji) and read-receipt privacy.
--
-- Reactions: participants of a conversation can react to its messages with emoji (up to 6
-- distinct emoji per member per message). Reactions are visible to the conversation's
-- participants only and are broadcast on the private conversation topic.
--
-- Read receipts: a reciprocal privacy setting (profiles.show_read_receipts). A member sees when
-- the other person read their messages only if BOTH have read receipts on. The raw
-- conversation_participants.last_read_at column is no longer readable by other participants;
-- read state is exposed through conversation_read_state(), which applies the rule.

-- ---------------------------------------------------------------------------------------------
-- Reactions
-- ---------------------------------------------------------------------------------------------
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Validated as an emoji in the application layer; here: short, and no letters, whitespace or markup.
  emoji text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[A-Za-z[:space:]<>"''`\\]'),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_user_idx on public.message_reactions (user_id);

alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select, delete on public.message_reactions to authenticated;
grant insert (message_id, user_id, emoji) on public.message_reactions to authenticated;

create policy "participants read reactions" on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_conversation_participant(m.conversation_id)
    )
  );

create policy "participants react" on public.message_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_member((select auth.uid()))
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_participant(m.conversation_id)
        and not exists (
          select 1 from public.conversation_participants o
          where o.conversation_id = m.conversation_id and o.user_id <> (select auth.uid())
            and public.is_blocked_between((select auth.uid()), o.user_id)
        )
    )
  );

create policy "members remove own reactions" on public.message_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- At most 6 distinct reactions per member per message.
create or replace function public.enforce_reaction_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.message_id::text || new.user_id::text, 0));
  if (select count(*) from public.message_reactions r where r.message_id = new.message_id and r.user_id = new.user_id) >= 6 then
    raise exception 'You can add up to 6 reactions to a message' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_reaction_limit() from public, anon, authenticated;

create trigger message_reactions_limit before insert on public.message_reactions
  for each row execute function public.enforce_reaction_limit();

-- Live updates on the conversation's private topic.
create or replace function public.broadcast_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.message_reactions := coalesce(new, old);
  v_conversation uuid;
begin
  select m.conversation_id into v_conversation from public.messages m where m.id = r.message_id;
  if v_conversation is not null then
    perform public.safe_broadcast('conversation:' || v_conversation, 'reaction.changed', jsonb_build_object(
      'message_id', r.message_id, 'user_id', r.user_id, 'emoji', r.emoji,
      'op', case when tg_op = 'DELETE' then 'remove' else 'add' end));
  end if;
  return null;
end;
$$;
revoke execute on function public.broadcast_reaction() from public, anon, authenticated;

create trigger message_reactions_broadcast after insert or delete on public.message_reactions
  for each row execute function public.broadcast_reaction();

-- ---------------------------------------------------------------------------------------------
-- Read-receipt privacy
-- ---------------------------------------------------------------------------------------------
alter table public.profiles add column show_read_receipts boolean not null default true;
grant update (show_read_receipts) on public.profiles to authenticated;

-- Other participants can no longer read last_read_at directly. Own state stays writable
-- (mark-as-read updates only the caller's row) and the conversation list keeps working
-- through conversation_summaries below.
revoke select on public.conversation_participants from authenticated;
grant select (conversation_id, user_id, joined_at) on public.conversation_participants to authenticated;

-- Same result as before; now SECURITY DEFINER so it can read the caller's own last_read_at.
-- Every row is scoped to conversations the caller participates in (me.user_id = auth.uid()).
create or replace function public.conversation_summaries(p_limit integer default 30, p_before timestamptz default null)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender uuid,
  unread_count bigint
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
        and (me.last_read_at is null or m.created_at > me.last_read_at))
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
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

-- Read state for a conversation the caller belongs to. The caller always sees their own
-- last_read_at; another participant's is returned only when both have read receipts on.
create or replace function public.conversation_read_state(p_conversation uuid)
returns table (user_id uuid, last_read_at timestamptz, receipts_visible boolean, is_self boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.show_read_receipts as mine
    from public.conversation_participants cp
    join public.profiles p on p.id = cp.user_id
    where cp.conversation_id = p_conversation and cp.user_id = (select auth.uid())
  )
  select
    cp.user_id,
    case
      when cp.user_id = (select auth.uid()) then cp.last_read_at
      when (select mine from me) and p.show_read_receipts then cp.last_read_at
      else null
    end,
    cp.user_id = (select auth.uid()) or ((select mine from me) and p.show_read_receipts),
    cp.user_id = (select auth.uid())
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = p_conversation
    and exists (select 1 from me);
$$;
revoke execute on function public.conversation_read_state(uuid) from public, anon;
grant execute on function public.conversation_read_state(uuid) to authenticated;

-- Read events are broadcast only when every participant has read receipts on, so a member who
-- turned receipts off never leaks (or receives) read times through realtime either.
create or replace function public.broadcast_read_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_at is distinct from old.last_read_at
     and not exists (
       select 1 from public.conversation_participants cp
       join public.profiles p on p.id = cp.user_id
       where cp.conversation_id = new.conversation_id and not p.show_read_receipts
     ) then
    perform public.safe_broadcast('conversation:' || new.conversation_id, 'conversation.read',
      jsonb_build_object('user_id', new.user_id, 'last_read_at', new.last_read_at));
  end if;
  return null;
end;
$$;
revoke execute on function public.broadcast_read_receipt() from public, anon, authenticated;

drop trigger if exists conversation_participants_broadcast on public.conversation_participants;
create trigger conversation_participants_broadcast after update of last_read_at on public.conversation_participants
  for each row execute function public.broadcast_read_receipt();
