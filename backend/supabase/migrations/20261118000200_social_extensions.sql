-- ---------------------------------------------------------------------------
-- Social extensions: reposts, @mention notifications, trending hashtags and the
-- "Private aviation" marketplace category.
--
-- New enum values are only referenced inside plpgsql bodies (resolved at run time), so they
-- can be added in the same migration as the functions that use them.
-- ---------------------------------------------------------------------------

alter type public.notification_type add value if not exists 'mention';
alter type public.notification_type add value if not exists 'post_reposted';
alter type public.listing_category add value if not exists 'aviation';

-- Mentions and reposts honour the member's "post activity" notification preference.
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
      when p_type::text in ('post_liked', 'post_commented', 'post_reposted', 'mention') then v_prefs.post_activity
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

-- ---------------------------------------------------------------------------
-- Reposts
-- ---------------------------------------------------------------------------

-- Maintained by trigger only: posts' column grants (insert/update) don't include it.
alter table public.posts add column repost_count integer not null default 0;

create table public.post_reposts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index post_reposts_post_idx on public.post_reposts (post_id);
create index post_reposts_recent_idx on public.post_reposts (created_at desc);

alter table public.post_reposts enable row level security;

grant select, delete on public.post_reposts to authenticated;
grant insert (user_id, post_id) on public.post_reposts to authenticated;

-- Who reposted what is visible when both the post and the reposter's profile are visible.
create policy "reposts visible with post and reposter" on public.post_reposts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      exists (select 1 from public.posts p where p.id = post_id)
      and exists (select 1 from public.profiles r where r.id = user_id)
    )
  );

-- Only posts the member can see, never their own, and never connections-only posts (reposting
-- them would widen their audience beyond what the author chose).
create policy "members repost shareable posts" on public.post_reposts
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_feature('feed.post')
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and p.visibility in ('public', 'members')
        and p.author_id <> (select auth.uid())
    )
  );

create policy "members undo own reposts" on public.post_reposts
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.bump_repost_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts
  set repost_count = greatest(0, repost_count + case when tg_op = 'INSERT' then 1 else -1 end)
  where id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;

create trigger post_reposts_counter after insert or delete on public.post_reposts
  for each row execute function public.bump_repost_counter();

create or replace function public.notify_on_repost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify((select author_id from public.posts where id = new.post_id), 'post_reposted', new.user_id, 'post', new.post_id,
    '{}', 'post_reposted:' || new.post_id || ':' || new.user_id);
  return null;
end;
$$;

create trigger post_reposts_notify after insert on public.post_reposts
  for each row execute function public.notify_on_repost();

-- If an author narrows a post to connections-only, existing reposts stop sharing it.
create or replace function public.drop_reposts_when_narrowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'connections' and old.visibility <> 'connections' then
    delete from public.post_reposts where post_id = new.id;
  end if;
  return null;
end;
$$;

create trigger posts_drop_reposts_when_narrowed after update of visibility on public.posts
  for each row execute function public.drop_reposts_when_narrowed();

-- ---------------------------------------------------------------------------
-- Mentions
-- ---------------------------------------------------------------------------

-- Whether a given member could see a post. Internal: reads tables directly (the public helpers
-- only answer about the caller) and is not executable through the API.
create or replace function public.user_can_view_post(p_user uuid, p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.posts p
    join public.profiles a on a.id = p.author_id and a.account_status = 'active'
    join public.profiles u on u.id = p_user and u.account_status = 'active' and u.onboarding_completed_at is not null
    where p.id = p_post
      and p.status = 'published'
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = p_user and b.blocked_id = p.author_id) or (b.blocker_id = p.author_id and b.blocked_id = p_user)
      )
      and (
        p.author_id = p_user
        or p.visibility in ('public', 'members')
        or (
          p.visibility = 'connections'
          and exists (
            select 1 from public.connections c
            where c.status = 'accepted'
              and least(c.requester_id, c.addressee_id) = least(p_user, p.author_id)
              and greatest(c.requester_id, c.addressee_id) = greatest(p_user, p.author_id)
          )
        )
      )
  );
$$;

revoke execute on function public.user_can_view_post(uuid, uuid) from public, anon, authenticated;

-- Notifies up to 10 distinct @handles in p_text who can see the post, aren't the actor and
-- haven't blocked (or been blocked by) the actor. `@` must not follow a word character, so
-- e-mail addresses don't count.
create or replace function public.notify_mentions(p_text text, p_actor uuid, p_post uuid, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text;
  v_user uuid;
begin
  for v_handle in
    select distinct lower(m[1])
    from regexp_matches(coalesce(p_text, ''), '(?:^|[^[:alnum:]_@.])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])', 'g') as m
    limit 10
  loop
    select id into v_user from public.profiles where handle = v_handle;
    if v_user is not null
      and v_user <> p_actor
      and public.user_can_view_post(v_user, p_post)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = v_user and b.blocked_id = p_actor) or (b.blocker_id = p_actor and b.blocked_id = v_user)
      )
    then
      perform public.notify(v_user, 'mention', p_actor, 'post', p_post, jsonb_build_object('source', split_part(p_source, ':', 1)),
        'mention:' || p_source || ':' || v_user);
    end if;
  end loop;
end;
$$;

revoke execute on function public.notify_mentions(text, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.notify_mentions_on_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or new.body is distinct from old.body) then
    -- The dedupe key is per post and member, so an edit only notifies newly mentioned members.
    perform public.notify_mentions(new.body, new.author_id, new.id, 'post:' || new.id);
  end if;
  return null;
end;
$$;

create trigger posts_notify_mentions after insert or update of body on public.posts
  for each row execute function public.notify_mentions_on_post();

create or replace function public.notify_mentions_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    perform public.notify_mentions(new.body, new.author_id, new.post_id, 'comment:' || new.id);
  end if;
  return null;
end;
$$;

create trigger post_comments_notify_mentions after insert on public.post_comments
  for each row execute function public.notify_mentions_on_comment();

-- Trigger functions are never meant to be called through the API.
revoke execute on function public.bump_repost_counter() from public, anon, authenticated;
revoke execute on function public.notify_on_repost() from public, anon, authenticated;
revoke execute on function public.drop_reposts_when_narrowed() from public, anon, authenticated;
revoke execute on function public.notify_mentions_on_post() from public, anon, authenticated;
revoke execute on function public.notify_mentions_on_comment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trending hashtags (aggregates only)
-- ---------------------------------------------------------------------------

-- Counts distinct recent posts per hashtag across posts every active member may see
-- (public/members audiences, published, active authors). Connections-only posts are never
-- counted, and only tag names and counts leave the function. Active members only.
create or replace function public.trending_hashtags(p_days int default 7, p_limit int default 10)
returns table (tag text, post_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.tag, count(distinct t.post_id)::int as post_count
  from (
    select p.id as post_id, lower(m[1]) as tag
    from public.posts p
    join public.profiles a on a.id = p.author_id and a.account_status = 'active'
    cross join lateral regexp_matches(p.body, '(?:^|[^[:alnum:]_&])#([[:alnum:]_]{2,40})', 'g') as m
    where public.is_active_member()
      and p.status = 'published'
      and p.visibility in ('public', 'members')
      and p.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30))
  ) t
  group by t.tag
  having count(distinct t.post_id) >= 2
  order by post_count desc, t.tag
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

revoke execute on function public.trending_hashtags(int, int) from public, anon;
grant execute on function public.trending_hashtags(int, int) to authenticated;
