-- Double opt-in introductions (builds on 20261118000300).
--
-- Flow: requester asks introducer → introducer forwards (with a note) or declines → target
-- accepts or declines. Only when the target accepts are the two connected, and a private
-- conversation is opened between them; until then neither side's connections-only details are
-- shared.
--
-- Changes:
-- * Requests expire 14 days after they're made (status 'expired', applied lazily: an expired
--   request can't be acted on and is closed the next time anyone touches it).
-- * Declines are private. The requester can no longer read the table directly; they read
--   my_introductions(), which reports any decline or expiry as "unavailable" and never says who
--   declined. A target's decline sends no notification; an introducer's decline sends a neutral
--   one with no actor.
-- * The introducer also isn't told whether the target declined or simply didn't answer.
-- * The requester no longer sees the introducer's note (it's written for the target).

alter table public.introduction_requests
  add column expires_at timestamptz not null default (now() + interval '14 days'),
  add column forwarded_at timestamptz,
  add column conversation_id uuid references public.conversations (id) on delete set null;
create index introduction_requests_conversation_idx on public.introduction_requests (conversation_id) where conversation_id is not null;
-- Requests forwarded before this migration.
update public.introduction_requests set forwarded_at = updated_at
where status = 'forwarded' or (status in ('accepted', 'declined') and declined_by is distinct from introducer_id);

-- Direct reads: only the target (once the request was forwarded to them — every status they can
-- see is their own doing) and staff. Requester and introducer read through my_introductions(),
-- which hides who declined. declined_by isn't readable directly at all.
drop policy "parties read introductions" on public.introduction_requests;
create policy "target or staff read introductions" on public.introduction_requests
  for select to authenticated
  using (
    (target_id = (select auth.uid()) and forwarded_at is not null)
    or public.is_staff('moderator')
  );
revoke select on public.introduction_requests from authenticated;
grant select (id, requester_id, introducer_id, target_id, message, introducer_note, status, created_at, updated_at, expires_at, forwarded_at, conversation_id)
  on public.introduction_requests to authenticated;

-- Closes requests past their expiry. Internal.
create or replace function public.expire_introductions(p_requester uuid default null, p_target uuid default null)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.introduction_requests
     set status = 'expired', updated_at = now()
   where status in ('pending', 'forwarded') and expires_at <= now()
     and (p_requester is null or requester_id = p_requester)
     and (p_target is null or target_id = p_target);
$$;
revoke execute on function public.expire_introductions(uuid, uuid) from public, anon, authenticated;

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
  select count(*) into v_recent from public.introduction_requests
  where requester_id = v_me and created_at > now() - interval '7 days';
  if v_recent >= 10 then
    raise exception 'You have reached the weekly limit for introduction requests' using errcode = '54000';
  end if;
  -- An expired request no longer blocks a new one.
  perform public.expire_introductions(v_me, p_target);

  insert into public.introduction_requests (requester_id, introducer_id, target_id, message)
  values (v_me, p_introducer, p_target, trim(p_message))
  returning id into v_id;

  perform public.notify(p_introducer, 'introduction', v_me, 'introduction', v_id, jsonb_build_object('status', 'pending'));
  return v_id;
end;
$$;

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
  if r.expires_at <= now() then
    raise exception 'This request has expired' using errcode = '55000';
  end if;
  if p_forward then
    if not public.intro_connected(v_me, r.target_id) then
      raise exception 'You are no longer connected to this member' using errcode = '42501';
    end if;
    if public.is_blocked_between(r.requester_id, r.target_id) then
      raise exception 'Introduction unavailable' using errcode = '42501';
    end if;
    update public.introduction_requests
      set status = 'forwarded', forwarded_at = now(), introducer_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
      where id = p_id;
    perform public.notify(r.target_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'forwarded'));
    perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'forwarded'));
  else
    update public.introduction_requests set status = 'declined', declined_by = v_me, updated_at = now() where id = p_id;
    -- Neutral and actor-less: the requester learns the introduction isn't happening, not why.
    perform public.notify(r.requester_id, 'introduction', null, 'introduction', p_id, jsonb_build_object('status', 'unavailable'));
  end if;
end;
$$;

-- Target: accept (connects the two and opens a conversation) or decline (silently).
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
  v_conversation uuid;
begin
  select * into r from public.introduction_requests where id = p_id for update;
  if not found or r.target_id is distinct from v_me or r.status <> 'forwarded' then
    raise exception 'Introduction not found' using errcode = 'P0002';
  end if;
  if r.expires_at <= now() then
    raise exception 'This introduction has expired' using errcode = '55000';
  end if;
  if not p_accept then
    update public.introduction_requests set status = 'declined', declined_by = v_me, updated_at = now() where id = p_id;
    return;
  end if;
  if public.is_blocked_between(r.requester_id, v_me) or not public.is_active_member(r.requester_id) then
    raise exception 'Introduction unavailable' using errcode = '42501';
  end if;

  -- Connect the two members (or accept an existing pending request between them).
  update public.connections set status = 'accepted', responded_at = now()
    where status = 'pending'
      and ((requester_id = r.requester_id and addressee_id = v_me) or (requester_id = v_me and addressee_id = r.requester_id));
  if not found and not public.intro_connected(r.requester_id, v_me) then
    insert into public.connections (requester_id, addressee_id, status, responded_at, message)
    values (r.requester_id, v_me, 'accepted', now(), null);
  end if;

  -- Both sides opted in, so open (or reuse) their 1:1 conversation, unless either has turned
  -- messages off entirely.
  if not exists (
    select 1 from public.profiles p where p.id in (r.requester_id, v_me) and p.messaging_policy = 'nobody'
  ) then
    select cp1.conversation_id into v_conversation
    from public.conversation_participants cp1
    join public.conversation_participants cp2 on cp2.conversation_id = cp1.conversation_id and cp2.user_id = r.requester_id
    where cp1.user_id = v_me
      and (select count(*) from public.conversation_participants c where c.conversation_id = cp1.conversation_id) = 2
    limit 1;
    if v_conversation is null then
      insert into public.conversations default values returning id into v_conversation;
      insert into public.conversation_participants (conversation_id, user_id) values (v_conversation, v_me), (v_conversation, r.requester_id);
    end if;
  end if;

  update public.introduction_requests
     set status = 'accepted', conversation_id = v_conversation, updated_at = now()
   where id = p_id;
  perform public.notify(r.requester_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'accepted'));
  perform public.notify(r.introducer_id, 'introduction', v_me, 'introduction', p_id, jsonb_build_object('status', 'accepted'));
end;
$$;

create or replace function public.withdraw_introduction(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.introduction_requests set status = 'withdrawn', updated_at = now()
  where id = p_id and requester_id = auth.uid() and status in ('pending', 'forwarded') and expires_at > now();
  if not found then
    raise exception 'Introduction not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Every introduction the caller is part of, with what their role may know.
--   requester: pending | forwarded | accepted | unavailable (declined by anyone, or expired) | withdrawn
--   introducer: pending | forwarded | accepted | declined (by them) | unavailable (target declined
--               or it expired after forwarding) | expired (before they acted) | withdrawn
--   target: forwarded | accepted | declined | expired | withdrawn
create or replace function public.my_introductions()
returns table (
  id uuid, role text, status text, requester_id uuid, introducer_id uuid, target_id uuid,
  message text, introducer_note text, conversation_id uuid, expires_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.*,
      case
        when r.requester_id = (select auth.uid()) then 'requester'
        when r.introducer_id = (select auth.uid()) then 'introducer'
        else 'target'
      end as my_role,
      case
        when r.status in ('pending', 'forwarded') and r.expires_at <= now() then 'expired'
        else r.status::text
      end as real_status
    from public.introduction_requests r
    where (select auth.uid()) is not null
      and (
        r.requester_id = (select auth.uid())
        or r.introducer_id = (select auth.uid())
        -- A target never sees a request that wasn't forwarded to them.
        or (r.target_id = (select auth.uid()) and r.forwarded_at is not null)
      )
  )
  select m.id, m.my_role,
    case m.my_role
      when 'requester' then
        case when m.real_status in ('declined', 'expired') then 'unavailable' else m.real_status end
      when 'introducer' then
        case
          when m.real_status = 'declined' and m.declined_by = m.introducer_id then 'declined'
          when m.real_status = 'declined' then 'unavailable'
          -- Expired after forwarding: the introducer did their part; the target's silence is private.
          when m.real_status = 'expired' and m.forwarded_at is not null then 'unavailable'
          else m.real_status
        end
      else m.real_status
    end,
    m.requester_id, m.introducer_id, m.target_id, m.message,
    case when m.my_role = 'requester' then null else m.introducer_note end,
    case when m.real_status = 'accepted' and m.my_role in ('requester', 'target') then m.conversation_id end,
    m.expires_at, m.created_at, m.updated_at
  from mine m
  order by m.updated_at desc
  limit 100;
$$;

revoke execute on function public.my_introductions() from public, anon;
grant execute on function public.my_introductions() to authenticated;
