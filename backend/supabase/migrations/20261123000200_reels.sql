-- Reels: short vertical videos (up to 90 seconds) with likes, comments, views and shares.
--
-- Audience is never wider than "members" (no signed-out access). Videos and poster frames live
-- in the private "reels" bucket under the author's folder and are served only through
-- short-lived signed URLs to viewers who can currently see the reel (storage RLS defers to the
-- reels policy). Counters are maintained by triggers; clients cannot write them. Views are
-- deduplicated per viewer and the author's own plays never count.

alter type public.notification_type add value if not exists 'reel_liked';
alter type public.notification_type add value if not exists 'reel_commented';
alter type public.report_target add value if not exists 'reel';

-- ---------------------------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'reels', 'reels', false, 104857600,
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table public.reels (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  video_path text not null unique check (char_length(video_path) between 3 and 300),
  poster_path text unique check (poster_path is null or char_length(poster_path) between 3 and 300),
  duration_s numeric(6, 2) not null check (duration_s > 0 and duration_s <= 90),
  width int not null check (width between 1 and 8000),
  height int not null check (height between 1 and 8000),
  visibility public.visibility not null default 'members' check (visibility in ('members', 'connections')),
  status public.content_status not null default 'published',
  like_count int not null default 0,
  comment_count int not null default 0,
  view_count int not null default 0,
  share_count int not null default 0,
  created_at timestamptz not null default now(),
  -- Media must be the author's own uploads.
  check (split_part(video_path, '/', 1) = author_id::text and position('..' in video_path) = 0),
  check (poster_path is null or (split_part(poster_path, '/', 1) = author_id::text and position('..' in poster_path) = 0))
);
create index reels_recent_idx on public.reels (created_at desc) where status = 'published';
create index reels_author_idx on public.reels (author_id, created_at desc);

create table public.reel_likes (
  reel_id uuid not null references public.reels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);
create index reel_likes_user_idx on public.reel_likes (user_id);

create table public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index reel_comments_reel_idx on public.reel_comments (reel_id, created_at);

create table public.reel_views (
  reel_id uuid not null references public.reels (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);
create index reel_views_viewer_idx on public.reel_views (viewer_id);

create table public.reel_shares (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reel_shares_reel_idx on public.reel_shares (reel_id);

-- ---------------------------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_view_reel(p_author uuid, p_visibility public.visibility, p_status public.content_status)
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
      and auth.uid() is not null
      and public.is_active_member()
      and not public.is_blocked_between(auth.uid(), p_author)
      and exists (
        select 1 from public.profiles a
        where a.id = p_author
          and public.can_view_profile(a.id, a.profile_visibility, a.account_status, a.onboarding_completed_at is not null)
      )
      and (
        p_visibility = 'members'
        or (p_visibility = 'connections' and public.are_connected(auth.uid(), p_author))
      )
    );
$$;

-- Storage paths may belong to at most one reel: a path is the reel's video or poster.
create or replace function public.reel_media_readable(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  -- Runs as the caller, so the reels select policy decides.
  select exists (select 1 from public.reels r where r.video_path = p_name or r.poster_path = p_name);
$$;

-- ---------------------------------------------------------------------------------------------
-- Limits and counters
-- ---------------------------------------------------------------------------------------------
create or replace function public.reels_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('reels:' || new.author_id::text));
  if (select count(*) from public.reels r where r.author_id = new.author_id and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'You can post up to 20 reels a day.' using errcode = 'P0001';
  end if;
  -- Both files must already be uploaded to the author's folder.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'reels' and o.name = new.video_path) then
    raise exception 'Upload the video first.' using errcode = 'P0002';
  end if;
  if new.poster_path is not null
     and not exists (select 1 from storage.objects o where o.bucket_id = 'reels' and o.name = new.poster_path) then
    raise exception 'Upload the cover image first.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create trigger reels_enforce_limit before insert on public.reels
  for each row execute function public.reels_enforce_limit();

create or replace function public.bump_reel_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta int := case when tg_op = 'INSERT' then 1 else -1 end;
  v_reel uuid;
begin
  if tg_op = 'INSERT' then
    v_reel := new.reel_id;
  else
    v_reel := old.reel_id;
  end if;
  if tg_table_name = 'reel_likes' then
    update public.reels set like_count = greatest(like_count + v_delta, 0) where id = v_reel;
  elsif tg_table_name = 'reel_comments' then
    update public.reels set comment_count = greatest(comment_count + v_delta, 0) where id = v_reel;
  elsif tg_table_name = 'reel_views' then
    update public.reels set view_count = greatest(view_count + v_delta, 0) where id = v_reel;
  elsif tg_table_name = 'reel_shares' then
    update public.reels set share_count = greatest(share_count + v_delta, 0) where id = v_reel;
  end if;
  return null;
end;
$$;

create trigger reel_likes_count after insert or delete on public.reel_likes
  for each row execute function public.bump_reel_counters();
create trigger reel_comments_count after insert or delete on public.reel_comments
  for each row execute function public.bump_reel_counters();
create trigger reel_views_count after insert or delete on public.reel_views
  for each row execute function public.bump_reel_counters();
create trigger reel_shares_count after insert or delete on public.reel_shares
  for each row execute function public.bump_reel_counters();

-- Notifications respect the recipient's "post activity" preference.
create or replace function public.notify_reel_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_actor uuid;
begin
  select r.author_id into v_author from public.reels r where r.id = new.reel_id;
  if tg_table_name = 'reel_likes' then
    v_actor := new.user_id;
  else
    v_actor := new.author_id;
  end if;
  if v_author is null or v_author = v_actor
     or not coalesce((select np.post_activity from public.notification_preferences np where np.user_id = v_author), true) then
    return null;
  end if;
  if tg_table_name = 'reel_likes' then
    perform public.notify(v_author, 'reel_liked', v_actor, 'reel', new.reel_id, '{}'::jsonb,
      'reel_liked:' || new.reel_id || ':' || v_actor);
  else
    perform public.notify(v_author, 'reel_commented', v_actor, 'reel', new.reel_id,
      jsonb_build_object('comment_id', new.id), 'reel_commented:' || new.id);
  end if;
  return null;
end;
$$;

create trigger reel_likes_notify after insert on public.reel_likes
  for each row execute function public.notify_reel_activity();
create trigger reel_comments_notify after insert on public.reel_comments
  for each row execute function public.notify_reel_activity();

-- Records one view per member per reel (only for reels the caller can see; never the author's).
create or replace function public.record_reel_view(p_reel uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_reel public.reels;
begin
  if v_me is null then
    raise exception 'Sign in to watch reels' using errcode = '42501';
  end if;
  select * into v_reel from public.reels where id = p_reel;
  if not found or not public.can_view_reel(v_reel.author_id, v_reel.visibility, v_reel.status) then
    raise exception 'Reel not found' using errcode = 'P0002';
  end if;
  if v_reel.author_id = v_me then
    return;
  end if;
  insert into public.reel_views (reel_id, viewer_id) values (p_reel, v_me) on conflict do nothing;
end;
$$;

-- Ranked feed: recent reels first, boosted for connections and engagement, and nudged down once
-- the viewer has watched them. Runs as the caller, so RLS decides what is visible.
create or replace function public.reel_feed(p_limit int default 8, p_exclude uuid[] default '{}')
returns setof public.reels
language sql
stable
security invoker
set search_path = ''
as $$
  select r.*
  from public.reels r
  where r.status = 'published'
    and r.created_at > now() - interval '90 days'
    and not (r.id = any (coalesce(p_exclude, '{}')))
  order by
    (case when r.author_id <> (select auth.uid()) and public.are_connected((select auth.uid()), r.author_id) then 2.0 else 0 end)
    + ln(1 + r.like_count + 2 * r.comment_count + 3 * r.share_count + 0.1 * r.view_count)
    - extract(epoch from (now() - r.created_at)) / 86400.0 * 0.35
    - (case when exists (select 1 from public.reel_views v where v.reel_id = r.id and v.viewer_id = (select auth.uid())) then 1.5 else 0 end)
    desc,
    r.created_at desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------------------------
alter table public.reels enable row level security;
alter table public.reel_likes enable row level security;
alter table public.reel_comments enable row level security;
alter table public.reel_views enable row level security;
alter table public.reel_shares enable row level security;

revoke all on public.reels, public.reel_likes, public.reel_comments, public.reel_views, public.reel_shares from anon, authenticated;

grant select, delete on public.reels to authenticated;
grant insert (author_id, caption, video_path, poster_path, duration_s, width, height, visibility) on public.reels to authenticated;
grant update (caption, visibility) on public.reels to authenticated;
grant select, delete on public.reel_likes to authenticated;
grant insert (reel_id, user_id) on public.reel_likes to authenticated;
grant select, delete on public.reel_comments to authenticated;
grant insert (reel_id, author_id, body) on public.reel_comments to authenticated;
grant select on public.reel_views to authenticated;
grant select on public.reel_shares to authenticated;
grant insert (reel_id, user_id, conversation_id) on public.reel_shares to authenticated;

create policy "reels visible to their audience" on public.reels
  for select to authenticated
  using (public.can_view_reel(author_id, visibility, status));

create policy "members post own reels" on public.reels
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_active_member() and public.has_feature('feed.post'));

create policy "authors edit own reels" on public.reels
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "authors and moderators delete reels" on public.reels
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_staff('moderator'));

-- Likes, comments and shares are only possible on reels the caller can see (the subquery runs
-- under the reels policy) and never across a block.
create policy "likes visible with the reel" on public.reel_likes
  for select to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_id));
create policy "members like visible reels" on public.reel_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_member()
    and exists (select 1 from public.reels r where r.id = reel_id and r.status = 'published')
  );
create policy "members unlike" on public.reel_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "comments visible with the reel" on public.reel_comments
  for select to authenticated
  using (
    exists (select 1 from public.reels r where r.id = reel_id)
    and (author_id = (select auth.uid()) or not public.is_blocked_between((select auth.uid()), author_id))
  );
create policy "members comment on visible reels" on public.reel_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active_member()
    and public.has_feature('feed.post')
    and exists (select 1 from public.reels r where r.id = reel_id and r.status = 'published')
  );
create policy "comment authors, reel authors and moderators delete comments" on public.reel_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_staff('moderator')
    or exists (select 1 from public.reels r where r.id = reel_id and r.author_id = (select auth.uid()))
  );

-- Viewers see only their own view rows (counts are on the reel).
create policy "viewers see own views" on public.reel_views
  for select to authenticated
  using (viewer_id = (select auth.uid()));

create policy "sharers see own shares" on public.reel_shares
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members share visible reels" on public.reel_shares
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_member()
    and exists (select 1 from public.reels r where r.id = reel_id and r.status = 'published')
    and (conversation_id is null or public.is_conversation_participant(conversation_id))
  );

-- Storage: authors upload into their own folder; files are readable while the reel is, and by
-- the author (e.g. before the reel is created). Authors may delete their own files.
create policy "reels: authors upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reels'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_feature('feed.post')
  );
create policy "reels: readable with the reel"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reels'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.reel_media_readable(name))
  );
create policy "reels: authors delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'reels' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Moderation: reports on reels can hide, remove or restore them.
-- ---------------------------------------------------------------------------------------------
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
    elsif p_target_type::text = 'reel' then
      update public.reels set status = case p_action when 'hide_content' then 'hidden'::public.content_status
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

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------
revoke execute on function public.reels_enforce_limit() from public, anon, authenticated;
revoke execute on function public.bump_reel_counters() from public, anon, authenticated;
revoke execute on function public.notify_reel_activity() from public, anon, authenticated;
revoke execute on function public.can_view_reel(uuid, public.visibility, public.content_status) from public, anon;
grant execute on function public.can_view_reel(uuid, public.visibility, public.content_status) to authenticated;
revoke execute on function public.reel_media_readable(text) from public, anon;
grant execute on function public.reel_media_readable(text) to authenticated;
revoke execute on function public.record_reel_view(uuid) from public, anon;
grant execute on function public.record_reel_view(uuid) to authenticated;
revoke execute on function public.reel_feed(int, uuid[]) from public, anon;
grant execute on function public.reel_feed(int, uuid[]) to authenticated;
revoke execute on function public.moderate(public.moderation_action_type, text, public.report_target, uuid, uuid, uuid) from public, anon;
