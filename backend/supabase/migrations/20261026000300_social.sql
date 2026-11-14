-- Social graph, feed, messaging, notifications, reporting and moderation.

create type public.connection_status as enum ('pending', 'accepted', 'declined');
create type public.content_status as enum ('published', 'hidden', 'removed');
create type public.media_type as enum ('image', 'video');
create type public.notification_type as enum (
  'connection_request', 'connection_accepted', 'new_follower', 'post_liked', 'post_commented', 'message',
  'membership_update', 'application_update', 'verification_update', 'moderation_notice',
  'listing_inquiry', 'business_update', 'campaign_update'
);
create type public.report_target as enum ('post', 'comment', 'profile', 'listing', 'business', 'message');
create type public.report_reason as enum ('spam', 'harassment', 'impersonation', 'fraud', 'inappropriate', 'intellectual_property', 'other');
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type public.moderation_action_type as enum ('hide_content', 'remove_content', 'restore_content', 'warn', 'suspend', 'reinstate');

-- ---------------------------------------------------------------------------
-- Connections & blocks
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.connection_status not null default 'pending',
  message text check (char_length(message) <= 300),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index connections_unique_open_pair on public.connections
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');
create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- One-directional follows (lightweight, unlike mutual connections).
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, created_at desc);

create or replace function public.are_connected(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and least(c.requester_id, c.addressee_id) = least(p_a, p_b)
      and greatest(c.requester_id, c.addressee_id) = greatest(p_a, p_b)
  );
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Can the current viewer see a profile?
create or replace function public.can_view_profile(p_id uuid, p_visibility public.visibility, p_status public.account_status, p_onboarded boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_id = auth.uid()
    or public.is_staff('support')
    or (
      p_status = 'active' and p_onboarded
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), p_id))
      and (
        p_visibility = 'public'
        or (p_visibility = 'members' and public.is_active_member())
        or (p_visibility = 'connections' and public.are_connected(auth.uid(), p_id))
      )
    );
$$;

create policy "profiles visible per privacy settings" on public.profiles
  for select
  using (public.can_view_profile(id, profile_visibility, account_status, onboarding_completed_at is not null));

-- Onboarding completion: requires a real handle and display name.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = auth.uid()
    and account_status = 'active'
    and handle !~ '^member_[0-9a-f]{12}$';
  if not found then
    raise exception 'choose a handle before completing onboarding' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  visibility public.visibility not null default 'members',
  status public.content_status not null default 'published',
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_feed_idx on public.posts (created_at desc, id desc) where status = 'published';
create index posts_author_idx on public.posts (author_id, created_at desc);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  media_type public.media_type not null,
  alt_text text check (char_length(alt_text) <= 300),
  position smallint not null default 0 check (position between 0 and 9)
);

create index post_media_post_idx on public.post_media (post_id, position);

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at);

create table public.post_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create or replace function public.can_view_post(p_author uuid, p_visibility public.visibility, p_status public.content_status)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_author = auth.uid()
    or public.is_staff('moderator')
    or (
      p_status = 'published'
      and exists (select 1 from public.profiles a where a.id = p_author and a.account_status = 'active')
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), p_author))
      and (
        p_visibility = 'public'
        or (p_visibility = 'members' and public.is_active_member())
        or (p_visibility = 'connections' and public.are_connected(auth.uid(), p_author))
      )
    );
$$;

-- Counter maintenance (counts are not client-writable).
create or replace function public.bump_post_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'post_likes' then
    update public.posts set like_count = greatest(0, like_count + case when tg_op = 'INSERT' then 1 else -1 end)
    where id = coalesce(new.post_id, old.post_id);
  else
    update public.posts set comment_count = greatest(0, comment_count + case when tg_op = 'INSERT' then 1 else -1 end)
    where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end;
$$;

create trigger post_likes_counter after insert or delete on public.post_likes
  for each row execute function public.bump_post_counter();
create trigger post_comments_counter after insert or delete on public.post_comments
  for each row execute function public.bump_post_counter();

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  -- Client-generated idempotency key: retries of the same send never create duplicates.
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, client_id)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create or replace function public.is_conversation_participant(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id = p_user
  );
$$;

-- Whether the viewer may message p_other under p_other's messaging policy.
create or replace function public.can_message(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and auth.uid() <> p_other
    and public.has_feature('messages.send')
    and public.is_active_member(p_other)
    and not public.is_blocked_between(auth.uid(), p_other)
    and exists (
      select 1 from public.profiles o
      where o.id = p_other
        and (
          (o.messaging_policy = 'members')
          or (o.messaging_policy = 'connections' and public.are_connected(auth.uid(), p_other))
        )
    );
$$;

-- Find or create the 1:1 conversation with p_other.
create or replace function public.start_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_message(p_other) then
    raise exception 'you cannot message this member' using errcode = '42501';
  end if;

  select cp1.conversation_id into v_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2 on cp2.conversation_id = cp1.conversation_id and cp2.user_id = p_other
  where cp1.user_id = auth.uid()
    and (select count(*) from public.conversation_participants c where c.conversation_id = cp1.conversation_id) = 2
  limit 1;

  if v_id is null then
    insert into public.conversations default values returning id into v_id;
    insert into public.conversation_participants (conversation_id, user_id) values (v_id, auth.uid()), (v_id, p_other);
  end if;
  return v_id;
end;
$$;

create or replace function public.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  -- Collapse: at most one unread message notification per conversation per recipient.
  perform public.notify(cp.user_id, 'message', new.sender_id, 'conversation', new.conversation_id)
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = cp.user_id and n.type = 'message' and n.entity_id = new.conversation_id and n.read_at is null
    );
  return null;
end;
$$;

-- Conversation list with the other participant and unread count, for the viewer.
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
security invoker
set search_path = ''
as $$
  select
    c.id,
    other.user_id,
    c.last_message_at,
    lm.body,
    lm.sender_id,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid()
        and (me.last_read_at is null or m.created_at > me.last_read_at))
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
    and c.last_message_at is not null
    and (p_before is null or c.last_message_at < p_before)
  order by c.last_message_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Notifications (inserted by triggers / service role only)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}',
  -- Retried events (webhooks, re-likes, re-follows) map to the same key and are not duplicated.
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.after_message_insert();

-- Per-user in-app notification preferences. A missing row means "all enabled".
-- Account, membership, verification and moderation notices are mandatory.
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  connection_activity boolean not null default true,
  post_activity boolean not null default true,
  messages boolean not null default true,
  marketplace boolean not null default true,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create or replace function public.notify(
  p_user uuid, p_type public.notification_type, p_actor uuid, p_entity_type text, p_entity_id uuid,
  p_payload jsonb default '{}', p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefs public.notification_preferences;
begin
  if p_user is null or p_user is not distinct from p_actor then
    return;
  end if;
  select * into v_prefs from public.notification_preferences where user_id = p_user;
  if v_prefs.user_id is not null and not (
    case
      when p_type in ('connection_request', 'connection_accepted', 'new_follower') then v_prefs.connection_activity
      when p_type in ('post_liked', 'post_commented') then v_prefs.post_activity
      when p_type = 'message' then v_prefs.messages
      when p_type = 'listing_inquiry' then v_prefs.marketplace
      else true
    end
  ) then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, entity_type, entity_id, payload, dedupe_key)
  values (p_user, p_type, p_actor, p_entity_type, p_entity_id, coalesce(p_payload, '{}'), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.notify_on_social_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'connections' then
    if tg_op = 'INSERT' then
      perform public.notify(new.addressee_id, 'connection_request', new.requester_id, 'connection', new.id, '{}',
        'connection_request:' || new.id);
    elsif new.status = 'accepted' and old.status = 'pending' then
      perform public.notify(new.requester_id, 'connection_accepted', new.addressee_id, 'connection', new.id, '{}',
        'connection_accepted:' || new.id);
    end if;
  elsif tg_table_name = 'follows' then
    perform public.notify(new.followee_id, 'new_follower', new.follower_id, 'profile', new.follower_id, '{}',
      'new_follower:' || new.follower_id);
  elsif tg_table_name = 'post_likes' then
    perform public.notify((select author_id from public.posts where id = new.post_id), 'post_liked', new.user_id, 'post', new.post_id,
      '{}', 'post_liked:' || new.post_id || ':' || new.user_id);
  elsif tg_table_name = 'post_comments' then
    perform public.notify((select author_id from public.posts where id = new.post_id), 'post_commented', new.author_id, 'post', new.post_id,
      jsonb_build_object('comment_id', new.id));
  end if;
  return null;
end;
$$;

create trigger connections_notify after insert or update on public.connections
  for each row execute function public.notify_on_social_event();
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_on_social_event();
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function public.notify_on_social_event();
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function public.notify_on_social_event();

create or replace function public.notify_on_account_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'subscriptions' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      perform public.notify(new.user_id, 'membership_update', null, 'subscription', new.id,
        jsonb_build_object('status', new.status, 'plan_id', new.plan_id));
    end if;
  elsif tg_table_name = 'membership_applications' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'rejected', 'under_review') then
      perform public.notify(new.user_id, 'application_update', null, 'membership_application', new.id,
        jsonb_build_object('status', new.status, 'plan_id', new.plan_id));
    end if;
  elsif tg_table_name = 'verifications' then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      perform public.notify(new.user_id, 'verification_update', null, 'verification', new.id,
        jsonb_build_object('status', new.status, 'kind', new.kind));
    end if;
  end if;
  return null;
end;
$$;

create trigger subscriptions_notify after insert or update on public.subscriptions
  for each row execute function public.notify_on_account_event();
create trigger membership_applications_notify after update of status on public.membership_applications
  for each row execute function public.notify_on_account_event();
create trigger verifications_notify after update of status on public.verifications
  for each row execute function public.notify_on_account_event();

-- ---------------------------------------------------------------------------
-- Connection workflow
-- ---------------------------------------------------------------------------
create or replace function public.request_connection(p_addressee uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_feature('connections.request') then
    raise exception 'your membership does not include connection requests' using errcode = '42501';
  end if;
  if p_addressee = auth.uid() or not public.is_active_member(p_addressee)
     or public.is_blocked_between(auth.uid(), p_addressee) then
    raise exception 'connection not available' using errcode = 'P0001';
  end if;
  insert into public.connections (requester_id, addressee_id, message)
  values (auth.uid(), p_addressee, left(nullif(trim(p_message), ''), 300))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'a connection or pending request already exists' using errcode = 'P0001';
end;
$$;

create or replace function public.respond_to_connection(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connections
  set status = case when p_accept then 'accepted'::public.connection_status else 'declined'::public.connection_status end,
      responded_at = now()
  where id = p_id and addressee_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'request not found' using errcode = 'P0001';
  end if;
end;
$$;

-- Withdraw a pending request (requester) or remove an accepted connection (either party).
create or replace function public.remove_connection(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connections
  where id = p_id
    and (
      (status = 'pending' and requester_id = auth.uid())
      or (status = 'accepted' and auth.uid() in (requester_id, addressee_id))
    );
  if not found then
    raise exception 'connection not found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.after_block_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.connections
  where least(requester_id, addressee_id) = least(new.blocker_id, new.blocked_id)
    and greatest(requester_id, addressee_id) = greatest(new.blocker_id, new.blocked_id);
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end;
$$;

create trigger user_blocks_after_insert after insert on public.user_blocks
  for each row execute function public.after_block_insert();

-- ---------------------------------------------------------------------------
-- Reports & moderation
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 2000),
  status public.report_status not null default 'open',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index reports_queue_idx on public.reports (status, created_at);
create unique index reports_one_open_per_reporter on public.reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_type public.report_target,
  target_id uuid,
  action public.moderation_action_type not null,
  reason text not null check (char_length(reason) between 3 and 2000),
  report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Apply a moderation decision atomically. Staff only.
create or replace function public.moderate(
  p_action public.moderation_action_type,
  p_reason text,
  p_target_type public.report_target default null,
  p_target_id uuid default null,
  p_target_user uuid default null,
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_user uuid := p_target_user;
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action in ('hide_content', 'remove_content', 'restore_content') then
    if p_target_type = 'post' then
      update public.posts set status = case p_action when 'hide_content' then 'hidden'::public.content_status
        when 'remove_content' then 'removed'::public.content_status else 'published'::public.content_status end
      where id = p_target_id returning author_id into v_user;
    elsif p_target_type = 'comment' then
      update public.post_comments set status = case p_action when 'hide_content' then 'hidden'::public.content_status
        when 'remove_content' then 'removed'::public.content_status else 'published'::public.content_status end
      where id = p_target_id returning author_id into v_user;
    elsif p_target_type = 'listing' then
      update public.listings set status = case when p_action = 'restore_content' then 'archived'::public.listing_status
        else 'removed'::public.listing_status end
      where id = p_target_id;
      select b.owner_id into v_user from public.listings l join public.businesses b on b.id = l.business_id where l.id = p_target_id;
    else
      raise exception 'unsupported content target' using errcode = 'P0001';
    end if;
  elsif p_action in ('suspend', 'reinstate') then
    if v_user is null then
      raise exception 'target user required' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.staff_roles where user_id = v_user) and not public.is_staff('admin') then
      raise exception 'only admins can moderate staff accounts' using errcode = '42501';
    end if;
    update public.profiles set account_status = case p_action when 'suspend' then 'suspended'::public.account_status
      else 'active'::public.account_status end
    where id = v_user;
  end if;

  insert into public.moderation_actions (actor_id, target_user_id, target_type, target_id, action, reason, report_id)
  values (auth.uid(), v_user, p_target_type, p_target_id, p_action, p_reason, p_report_id)
  returning id into v_id;

  if p_report_id is not null then
    update public.reports set status = 'actioned', handled_by = auth.uid(), handled_at = now(), resolution_note = left(p_reason, 2000)
    where id = p_report_id;
  end if;

  if v_user is not null and p_action <> 'restore_content' then
    perform public.notify(v_user, 'moderation_notice', null, coalesce(p_target_type::text, 'profile'), coalesce(p_target_id, v_user),
      jsonb_build_object('action', p_action, 'reason', p_reason));
  end if;

  perform public.write_audit('moderation.' || p_action::text, coalesce(p_target_type::text, 'profile'),
    coalesce(p_target_id, v_user)::text, jsonb_build_object('reason', p_reason, 'report_id', p_report_id));
  return v_id;
end;
$$;

create or replace function public.dismiss_report(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('moderator') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now(), resolution_note = left(p_note, 2000)
  where id = p_id and status in ('open', 'reviewing');
  perform public.write_audit('report.dismissed', 'report', p_id::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.connections enable row level security;
alter table public.follows enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_blocks enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_saves enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.connections, public.follows, public.notification_preferences, public.user_blocks, public.posts, public.post_media, public.post_likes,
  public.post_comments, public.post_saves, public.conversations, public.conversation_participants,
  public.messages, public.notifications, public.reports, public.moderation_actions from anon, authenticated;

-- connections: read own; writes only through request/respond/remove functions.
grant select on public.connections to authenticated;
create policy "parties read connections" on public.connections
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));

grant select, insert, delete on public.follows to authenticated;
create policy "parties read follows" on public.follows
  for select to authenticated using (auth.uid() in (follower_id, followee_id));
create policy "members follow visible profiles" on public.follows
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and public.is_active_member()
    and not public.is_blocked_between(auth.uid(), followee_id)
    and exists (select 1 from public.profiles p where p.id = followee_id)
  );
create policy "members unfollow" on public.follows for delete to authenticated using (follower_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;
create policy "own notification preferences read" on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "own notification preferences insert" on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy "own notification preferences update" on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, delete on public.user_blocks to authenticated;
create policy "own blocks read" on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy "own blocks insert" on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "own blocks delete" on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

-- posts
grant select on public.posts to anon, authenticated;
grant insert (author_id, body, visibility) on public.posts to authenticated;
grant update (body, visibility) on public.posts to authenticated;
grant delete on public.posts to authenticated;
create policy "posts visible per audience" on public.posts
  for select using (public.can_view_post(author_id, visibility, status));
create policy "members create posts" on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.has_feature('feed.post'));
create policy "authors edit published posts" on public.posts
  for update to authenticated
  using (author_id = auth.uid() and status = 'published')
  with check (author_id = auth.uid());
create policy "authors delete posts" on public.posts
  for delete to authenticated using (author_id = auth.uid());

grant select on public.post_media to anon, authenticated;
grant insert (post_id, owner_id, storage_path, media_type, alt_text, position) on public.post_media to authenticated;
create policy "media follows post visibility" on public.post_media
  for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "authors attach media" on public.post_media
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/%'
    and exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

grant select, insert, delete on public.post_likes to authenticated;
create policy "likes visible with post" on public.post_likes
  for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy "members like visible posts" on public.post_likes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_member() and exists (select 1 from public.posts p where p.id = post_id));
create policy "members unlike" on public.post_likes for delete to authenticated using (user_id = auth.uid());

grant select on public.post_comments to anon, authenticated;
grant insert (post_id, author_id, body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
create policy "comments visible with post" on public.post_comments
  for select using (
    (status = 'published' or author_id = auth.uid() or public.is_staff('moderator'))
    and exists (select 1 from public.posts p where p.id = post_id)
  );
create policy "members comment on visible posts" on public.post_comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.has_feature('feed.post') and exists (select 1 from public.posts p where p.id = post_id));
create policy "authors or post owners delete comments" on public.post_comments
  for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

grant select, insert, delete on public.post_saves to authenticated;
create policy "own saves read" on public.post_saves for select to authenticated using (user_id = auth.uid());
create policy "own saves insert" on public.post_saves for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy "own saves delete" on public.post_saves for delete to authenticated using (user_id = auth.uid());

-- messaging
grant select on public.conversations, public.conversation_participants, public.messages to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
grant insert (conversation_id, sender_id, body, client_id) on public.messages to authenticated;
create policy "participants read conversations" on public.conversations
  for select to authenticated using (public.is_conversation_participant(id));
create policy "participants read participants" on public.conversation_participants
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "participants mark read" on public.conversation_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants read messages" on public.messages
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "participants send messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and public.has_feature('messages.send')
    and not exists (
      select 1 from public.conversation_participants o
      where o.conversation_id = messages.conversation_id and o.user_id <> auth.uid()
        and (public.is_blocked_between(auth.uid(), o.user_id) or not public.is_active_member(o.user_id))
    )
  );

-- notifications
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reports
grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;
create policy "reporters and staff read reports" on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_staff('moderator'));
create policy "members file reports" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');

grant select on public.moderation_actions to authenticated;
create policy "staff and targets read moderation actions" on public.moderation_actions
  for select to authenticated using (public.is_staff('moderator') or target_user_id = auth.uid());

revoke execute on function public.complete_onboarding() from public, anon;
revoke execute on function public.start_conversation(uuid) from public, anon;
revoke execute on function public.request_connection(uuid, text) from public, anon;
revoke execute on function public.respond_to_connection(uuid, boolean) from public, anon;
revoke execute on function public.remove_connection(uuid) from public, anon;
revoke execute on function public.moderate(public.moderation_action_type, text, public.report_target, uuid, uuid, uuid) from public, anon;
revoke execute on function public.dismiss_report(uuid, text) from public, anon;
revoke execute on function public.notify(uuid, public.notification_type, uuid, text, uuid, jsonb, text) from public, anon, authenticated;
