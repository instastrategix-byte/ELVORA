-- Polls in posts and private saved collections.
--
-- Polls: created atomically with (or within 10 minutes of) the author's own post through
-- create_post_poll; voting goes through vote_poll / clear_poll_vote. Clients can read a poll and
-- its options only when they can see the post, and can never read who voted — results are
-- aggregate counts from poll_results. Options can't be edited by anyone once created.
--
-- Collections: named, private groupings of saved posts and listings. Owner-only for everything,
-- and an item can only be added while its owner can see it.

-- ---------------------------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------------------------
create table public.post_polls (
  post_id uuid primary key references public.posts (id) on delete cascade,
  question text check (char_length(question) <= 200),
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now(),
  closes_at timestamptz not null default now() + interval '3 days',
  check (closes_at >= created_at + interval '59 minutes' and closes_at <= created_at + interval '14 days 1 minute')
);

create table public.post_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.post_polls (post_id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  unique (post_id, position)
);
create index post_poll_options_post_idx on public.post_poll_options (post_id);

create table public.post_poll_votes (
  post_id uuid not null references public.post_polls (post_id) on delete cascade,
  option_id uuid not null references public.post_poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, option_id)
);
create index post_poll_votes_option_idx on public.post_poll_votes (option_id);
create index post_poll_votes_user_idx on public.post_poll_votes (user_id);

alter table public.post_polls enable row level security;
alter table public.post_poll_options enable row level security;
alter table public.post_poll_votes enable row level security;

-- Reads only; every write goes through the functions below.
revoke all on public.post_polls, public.post_poll_options, public.post_poll_votes from anon, authenticated;
grant select on public.post_polls, public.post_poll_options to anon, authenticated;

-- The subquery on posts is itself subject to the posts RLS policy, so a poll is visible exactly
-- when its post is.
create policy "polls visible with their post" on public.post_polls
  for select using (exists (select 1 from public.posts p where p.id = post_id));
create policy "poll options visible with their post" on public.post_poll_options
  for select using (exists (select 1 from public.posts p where p.id = post_id));
-- post_poll_votes: no policies at all. Voter identities are never readable by clients.

create or replace function public.create_post_poll(
  p_post uuid,
  p_options text[],
  p_question text default null,
  p_allow_multiple boolean default false,
  p_duration_hours int default 72
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_post public.posts;
  v_labels text[];
  i int;
begin
  if v_me is null then
    raise exception 'Sign in to create a poll' using errcode = '42501';
  end if;
  select * into v_post from public.posts where id = p_post;
  if not found or v_post.author_id <> v_me then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not public.has_feature('feed.post') then
    raise exception 'Your membership does not include posting' using errcode = '42501';
  end if;
  if v_post.created_at < now() - interval '10 minutes' then
    raise exception 'Polls can only be added when the post is created' using errcode = '55000';
  end if;
  if exists (select 1 from public.post_polls where post_id = p_post) then
    raise exception 'This post already has a poll' using errcode = '23505';
  end if;
  select coalesce(array_agg(btrim(l)), '{}') into v_labels from unnest(p_options) as l where btrim(l) <> '';
  if cardinality(v_labels) < 2 or cardinality(v_labels) > 4 then
    raise exception 'A poll needs 2 to 4 options' using errcode = '22023';
  end if;
  if (select count(distinct lower(l)) from unnest(v_labels) as l) <> cardinality(v_labels) then
    raise exception 'Poll options must be different' using errcode = '22023';
  end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 336 then
    raise exception 'Polls can run from 1 hour to 14 days' using errcode = '22023';
  end if;

  insert into public.post_polls (post_id, question, allow_multiple, closes_at)
  values (p_post, nullif(btrim(coalesce(p_question, '')), ''), coalesce(p_allow_multiple, false), now() + make_interval(hours => p_duration_hours));
  for i in 1 .. cardinality(v_labels) loop
    insert into public.post_poll_options (post_id, position, label) values (p_post, i - 1, v_labels[i]);
  end loop;
end;
$$;

-- Replaces the caller's vote(s) on a poll. Allowed while the poll is open, for active members
-- who can see the post.
create or replace function public.vote_poll(p_post uuid, p_options uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_post public.posts;
  v_poll public.post_polls;
  v_count int;
begin
  if v_me is null or not public.is_active_member(v_me) then
    raise exception 'Only active members can vote' using errcode = '42501';
  end if;
  select * into v_post from public.posts where id = p_post;
  if not found or not public.can_view_post(v_post.author_id, v_post.visibility, v_post.status) or v_post.status <> 'published' then
    raise exception 'Poll not found' using errcode = 'P0002';
  end if;
  select * into v_poll from public.post_polls where post_id = p_post;
  if not found then
    raise exception 'Poll not found' using errcode = 'P0002';
  end if;
  if v_poll.closes_at <= now() then
    raise exception 'This poll has closed' using errcode = '55000';
  end if;
  v_count := coalesce(cardinality(p_options), 0);
  if v_count = 0 then
    raise exception 'Choose an option' using errcode = '22023';
  end if;
  if not v_poll.allow_multiple and v_count > 1 then
    raise exception 'This poll allows one choice' using errcode = '22023';
  end if;
  if (select count(*) from public.post_poll_options o where o.post_id = p_post and o.id = any (p_options)) <> (select count(distinct x) from unnest(p_options) x) then
    raise exception 'Invalid option' using errcode = '22023';
  end if;

  delete from public.post_poll_votes where post_id = p_post and user_id = v_me;
  insert into public.post_poll_votes (post_id, option_id, user_id)
  select p_post, x, v_me from (select distinct unnest(p_options) as x) d;
end;
$$;

create or replace function public.clear_poll_vote(p_post uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.post_polls where post_id = p_post and closes_at <= now()) then
    raise exception 'This poll has closed' using errcode = '55000';
  end if;
  delete from public.post_poll_votes where post_id = p_post and user_id = auth.uid();
end;
$$;

-- Aggregate results for a batch of posts (one call per feed page). Only polls on posts the
-- caller can see are returned; counts only, plus whether the caller chose each option.
create or replace function public.poll_results(p_posts uuid[])
returns table (
  post_id uuid,
  question text,
  allow_multiple boolean,
  closes_at timestamptz,
  option_id uuid,
  option_position smallint,
  label text,
  votes int,
  viewer_voted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select pl.post_id, pl.question, pl.allow_multiple, pl.closes_at, o.id, o.position, o.label,
         (select count(*)::int from public.post_poll_votes v where v.option_id = o.id),
         ((select auth.uid()) is not null and exists (
            select 1 from public.post_poll_votes v where v.option_id = o.id and v.user_id = (select auth.uid())))
  from public.post_polls pl
  join public.posts p on p.id = pl.post_id
  join public.post_poll_options o on o.post_id = pl.post_id
  where pl.post_id = any (p_posts[1:100])
    and public.can_view_post(p.author_id, p.visibility, p.status)
  order by pl.post_id, o.position;
$$;

revoke execute on function public.create_post_poll(uuid, text[], text, boolean, int) from public, anon;
revoke execute on function public.vote_poll(uuid, uuid[]) from public, anon;
revoke execute on function public.clear_poll_vote(uuid) from public, anon;
revoke execute on function public.poll_results(uuid[]) from public;
grant execute on function public.create_post_poll(uuid, text[], text, boolean, int) to authenticated;
grant execute on function public.vote_poll(uuid, uuid[]) to authenticated;
grant execute on function public.clear_poll_vote(uuid) to authenticated;
grant execute on function public.poll_results(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index collections_owner_name_unique on public.collections (owner_id, lower(btrim(name)));

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_type text not null check (item_type in ('post', 'listing')),
  item_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index collection_items_item_idx on public.collection_items (item_type, item_id);
create index collection_items_recent_idx on public.collection_items (collection_id, added_at desc);

alter table public.collections enable row level security;
alter table public.collection_items enable row level security;

revoke all on public.collections, public.collection_items from anon, authenticated;
grant select, delete on public.collections to authenticated;
grant insert (name), update (name) on public.collections to authenticated;
grant select, delete on public.collection_items to authenticated;
grant insert (collection_id, item_type, item_id) on public.collection_items to authenticated;

create policy "owners read collections" on public.collections
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create collections" on public.collections
  for insert to authenticated with check (owner_id = (select auth.uid()) and public.is_active_member());
create policy "owners rename collections" on public.collections
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete collections" on public.collections
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "owners read collection items" on public.collection_items
  for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));
-- The posts/listings subqueries run under their own RLS, so only items the owner can see are allowed.
create policy "owners add visible items" on public.collection_items
  for insert to authenticated
  with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid()))
    and (
      (item_type = 'post' and exists (select 1 from public.posts p where p.id = item_id))
      or (item_type = 'listing' and exists (select 1 from public.listings l where l.id = item_id and l.status = 'published'))
    )
  );
create policy "owners remove collection items" on public.collection_items
  for delete to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));

-- Caps: 50 collections per member, 500 items per collection.
create or replace function public.enforce_collection_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'collections' then
    perform pg_advisory_xact_lock(hashtextextended('collections:' || new.owner_id::text, 0));
    if (select count(*) from public.collections where owner_id = new.owner_id) >= 50 then
      raise exception 'You can have up to 50 collections' using errcode = '54000';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('collection_items:' || new.collection_id::text, 0));
    if (select count(*) from public.collection_items where collection_id = new.collection_id) >= 500 then
      raise exception 'A collection can hold up to 500 items' using errcode = '54000';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_collection_limits() from public, anon, authenticated;

create trigger collections_limit before insert on public.collections
  for each row execute function public.enforce_collection_limits();
create trigger collection_items_limit before insert on public.collection_items
  for each row execute function public.enforce_collection_limits();

-- Items have no foreign key (they point at two tables), so remove them when the target goes.
create or replace function public.remove_deleted_collection_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.collection_items
  where item_type = (case when tg_table_name = 'posts' then 'post' else 'listing' end) and item_id = old.id;
  return old;
end;
$$;
revoke execute on function public.remove_deleted_collection_items() from public, anon, authenticated;

create trigger posts_remove_collection_items after delete on public.posts
  for each row execute function public.remove_deleted_collection_items();
create trigger listings_remove_collection_items after delete on public.listings
  for each row execute function public.remove_deleted_collection_items();
