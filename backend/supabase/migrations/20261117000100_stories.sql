-- Stories: short-lived (24 hour) image or video updates shown in a rail on the dashboard and feed.
--
-- Audience is never wider than "members": stories are not visible to signed-out visitors.
-- Media lives in the private post-media bucket under the author's folder and is readable only
-- while the story itself is readable (see the storage policy at the end).

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  media_path text not null check (char_length(media_path) between 3 and 300),
  media_type text not null check (media_type in ('image', 'video')),
  caption text check (char_length(caption) <= 200),
  visibility public.visibility not null default 'members' check (visibility in ('members', 'connections')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (expires_at > created_at and expires_at <= created_at + interval '48 hours'),
  -- Media must be the author's own upload.
  check (split_part(media_path, '/', 1) = author_id::text and position('..' in media_path) = 0)
);

create index stories_author_expires_idx on public.stories (author_id, expires_at);
create index stories_expires_idx on public.stories (expires_at);
create index stories_media_path_idx on public.stories (media_path);

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index story_views_viewer_idx on public.story_views (viewer_id);

-- ---------------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------------

create or replace function public.can_view_story(p_author uuid, p_visibility public.visibility, p_expires_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_expires_at > now() and (
    p_author = auth.uid()
    or public.is_staff('moderator')
    or (
      auth.uid() is not null
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
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Limits: at most 20 active stories per author.
-- ---------------------------------------------------------------------------

create or replace function public.stories_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialise concurrent inserts by the same author so the count can't be raced.
  perform pg_advisory_xact_lock(hashtext('stories:' || new.author_id::text));
  if (
    select count(*) from public.stories s
    where s.author_id = new.author_id and s.expires_at > now()
  ) >= 20 then
    raise exception 'You can have at most 20 active stories.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger stories_enforce_limit
  before insert on public.stories
  for each row execute function public.stories_enforce_limit();

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

revoke all on public.stories, public.story_views from anon, authenticated;
grant select, delete on public.stories to authenticated;
-- expires_at is not client-writable: every story lasts the default 24 hours.
grant insert (author_id, media_path, media_type, caption, visibility) on public.stories to authenticated;
grant select on public.story_views to authenticated;
grant insert (story_id, viewer_id) on public.story_views to authenticated;

create policy "stories visible to their audience" on public.stories
  for select to authenticated
  using (public.can_view_story(author_id, visibility, expires_at));

create policy "members post own stories" on public.stories
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.has_feature('feed.post'));

create policy "authors and moderators delete stories" on public.stories
  for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_staff('moderator'));

-- A view can only be recorded by the viewer, and only for a story they can currently see
-- (the subquery runs under the stories policy above).
create policy "viewers record own views" on public.story_views
  for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from public.stories s where s.id = story_id)
  );

-- Authors see who viewed their stories; everyone else sees only their own view rows.
create policy "authors see viewers, viewers see own" on public.story_views
  for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (select 1 from public.stories s where s.id = story_id and s.author_id = (select auth.uid()))
  );

-- Story media in the private post-media bucket is readable while the story is.
create policy "story media readable with story"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and exists (select 1 from public.stories s where s.media_path = name)
  );

revoke execute on function public.stories_enforce_limit() from public, anon, authenticated;
revoke execute on function public.can_view_story(uuid, public.visibility, timestamptz) from public, anon;
grant execute on function public.can_view_story(uuid, public.visibility, timestamptz) to authenticated;
