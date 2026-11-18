-- =============================================================================
-- ELVORA DEVELOPMENT DEMO DATASET — COMMUNITIES. FICTIONAL. NEVER LOAD INTO PRODUCTION.
-- Runs after demo.sql. Skipped entirely when the communities migration isn't present.
-- 10 communities, members, 2 threads each and replies. Names end with "(Demo)".
-- =============================================================================

do $$
declare
  c record;
begin
  if exists (select 1 from auth.users where email not like '%@seed.elvora.test') then
    raise exception 'ELVORA demo seed refused: database contains non-seed users';
  end if;
  if to_regclass('public.communities') is null then
    raise notice 'communities table not found; skipping community demo data';
    return;
  end if;

  -- Creators are spread so no one exceeds the 5-communities-per-owner limit.
  insert into public.communities (id, slug, name, description, category, visibility, created_by, created_at)
  select ('44444444-0000-4000-8000-' || lpad(v.k::text, 12, '0'))::uuid, v.slug, v.name,
    'Demo community — fictional, for local development. ' || v.description, v.category,
    v.visibility::public.community_visibility,
    (lpad(v.owner::text, 8, '0') || '-5eed-4000-8000-' || lpad(v.owner::text, 12, '0'))::uuid,
    now() - make_interval(days => 20 - v.k)
  from (values
    (1, 'founders-circle-demo', 'Founders Circle (Demo)', 'Operators sharing what is working and what is not.', 'Entrepreneurship', 'open', 6),
    (2, 'private-investors-demo', 'Private Investors (Demo)', 'Angels, family offices and fund managers comparing notes.', 'Investing', 'private', 12),
    (3, 'yachting-and-sailing-demo', 'Yachting & Sailing (Demo)', 'Charters, refits, regattas and life at sea.', 'Yachting', 'open', 23),
    (4, 'collectors-salon-demo', 'Collectors Salon (Demo)', 'Art, provenance and building a collection with intent.', 'Art', 'open', 24),
    (5, 'hospitality-leaders-demo', 'Hospitality Leaders (Demo)', 'Hotel owners, operators and designers.', 'Hospitality', 'open', 22),
    (6, 'climate-builders-demo', 'Climate Builders (Demo)', 'Founders and investors working on decarbonisation.', 'Climate', 'open', 19),
    (7, 'performance-cars-demo', 'Performance Cars (Demo)', 'Track days, collections and the electric transition.', 'Automotive', 'open', 30),
    (8, 'private-aviation-demo', 'Private Aviation (Demo)', 'Charter, ownership and sustainable flying.', 'Aviation', 'open', 16),
    (9, 'women-in-leadership-demo', 'Women in Leadership (Demo)', 'A private circle for senior women leaders.', 'Leadership', 'private', 20),
    (10, 'architecture-and-design-demo', 'Architecture & Design (Demo)', 'Residences, restoration and material craft.', 'Design', 'open', 11)
  ) as v (k, slug, name, description, category, visibility, owner);

  -- Members (the owner row is added by the communities trigger).
  insert into public.community_members (community_id, user_id, role, status, joined_at)
  select ('44444444-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid,
    (lpad(n::text, 8, '0') || '-5eed-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    (case when (k + n) % 11 = 0 then 'moderator' else 'member' end)::public.community_role,
    (case when k in (2, 9) and n % 5 = 0 and (k + n) % 11 <> 0 then 'pending' else 'active' end)::public.community_member_status,
    now() - make_interval(days => (k + n) % 18)
  from generate_series(1, 10) k
  cross join generate_series(2, 30) n
  where (k * 3 + n) % 3 = 0 or (k + n) % 4 = 0
  on conflict (community_id, user_id) do nothing;

  -- Two discussions per community, started by active members.
  -- The owner opens the pinned welcome thread; the next active member opens the second.
  insert into public.community_threads (community_id, author_id, title, body, pinned, created_at, last_activity_at)
  select co.id, a.user_id, t.title, t.body, t.k = 1,
    now() - make_interval(days => t.k * 2), now() - make_interval(days => t.k * 2)
  from public.communities co
  cross join (values
    (1, 'Introduce yourself', 'Demo thread — who are you, what are you building, and what would make this community useful to you?'),
    (2, 'What is one lesson from this year?', 'Demo thread — share one thing you would do differently.')
  ) as t (k, title, body)
  cross join lateral (
    select cm.user_id from public.community_members cm
    where cm.community_id = co.id and cm.status = 'active'
    order by cm.role, cm.user_id
    offset (t.k - 1) limit 1
  ) a;

  -- Replies from other active members.
  for c in select id, community_id, author_id from public.community_threads loop
    insert into public.community_replies (thread_id, author_id, body, created_at)
    select c.id, cm.user_id, r.body, now() - make_interval(hours => r.k * 5)
    from (values
      (1, 'Demo reply — great to be here. Looking forward to the conversations.'),
      (2, 'Demo reply — agreed. Happy to share what we learned.')
    ) as r (k, body)
    cross join lateral (
      select cm.user_id from public.community_members cm
      where cm.community_id = c.community_id and cm.status = 'active' and cm.user_id <> c.author_id
      order by cm.user_id offset (r.k - 1) limit 1
    ) cm;
  end loop;
end;
$$;
