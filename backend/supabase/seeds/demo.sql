-- =============================================================================
-- ELVORA DEVELOPMENT DEMO DATASET — FICTIONAL DATA ONLY. NEVER LOAD INTO PRODUCTION.
--
-- * Loaded after ../seed.sql by `supabase db reset` against the LOCAL stack only.
--   `supabase db push` never runs seed files. Never run this file against a linked project.
-- * Every person, business, listing, post, story, event and community is fictional.
--   Profiles' bios start with "Demo profile —", demo business names end with "(Demo)" and
--   demo listing summaries start with "Demo listing —", so nothing can be mistaken for
--   genuine member activity.
-- * No external images are referenced. Avatars, covers and post/listing media are left empty
--   (the UI has designed fallbacks). Stories need a media path, so they point at paths in each
--   author's own folder; the files themselves do not exist locally ("media unavailable").
-- * Login for every seed account: <handle-email>@seed.elvora.test / ElvoraLocal2026
-- =============================================================================

do $$
begin
  if exists (select 1 from auth.users where email not like '%@seed.elvora.test') then
    raise exception 'ELVORA demo seed refused: database contains non-seed users';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 25 additional demo members (ids ...006–...030). The auth trigger creates each profile.
-- -----------------------------------------------------------------------------
create temporary table demo_people (
  n int primary key,
  id uuid not null,
  handle text not null,
  name text not null,
  member_type text not null,
  headline text not null,
  job_title text not null,
  company text not null,
  industry text not null,
  location text not null,
  interests text[] not null,
  skills text[] not null,
  open_to text[] not null,
  bio text not null
);

insert into demo_people values
  (6, '00000006-5eed-4000-8000-000000000006', 'amara_okafor', 'Amara Okafor', 'founder', 'Founder & CEO building preventive-care clinics', 'Founder & CEO', 'Lumen Health (Demo)', 'Healthcare', 'Lagos, Nigeria', '{healthtech,impact,art}', '{Fundraising,Operations,Healthcare strategy}', '{investing,mentoring,speaking}', 'Scaling preventive care across West Africa; previously in consulting.'),
  (7, '00000007-5eed-4000-8000-000000000007', 'lucas_beaumont', 'Lucas Beaumont', 'investor', 'General Partner backing European consumer brands', 'General Partner', 'Northgate Ventures (Demo)', 'Venture Capital', 'Paris, France', '{venture,wine,sailing}', '{Due diligence,Board governance,Consumer brands}', '{investing,board_roles,introductions}', 'Early-stage investor in premium consumer and hospitality brands.'),
  (8, '00000008-5eed-4000-8000-000000000008', 'sofia_lindqvist', 'Sofia Lindqvist', 'executive', 'COO modernising short-sea shipping', 'Chief Operating Officer', 'Nordhavn Shipping (Demo)', 'Maritime', 'Stockholm, Sweden', '{sustainability,sailing,design}', '{Operations,Decarbonisation,Supply chain}', '{advisory,speaking}', 'Leads operations and the fleet''s transition to low-emission vessels.'),
  (9, '00000009-5eed-4000-8000-000000000009', 'kenji_watanabe', 'Kenji Watanabe', 'founder', 'Co-founder building service robots for hotels', 'Co-founder & CTO', 'Kumo Robotics (Demo)', 'Technology', 'Tokyo, Japan', '{robotics,hospitality,architecture}', '{Robotics,Product,Engineering leadership}', '{partnerships,hiring}', 'Building quiet, discreet robotics for luxury hospitality.'),
  (10, '00000010-5eed-4000-8000-000000000010', 'priya_raman', 'Priya Raman', 'executive', 'CFO of a pan-Asian hotel group', 'Chief Financial Officer', 'Meridian Hotels Group (Demo)', 'Hospitality', 'Singapore', '{hospitality,finance,travel}', '{Corporate finance,M&A,Capital markets}', '{board_roles,advisory}', 'Finance leader across hotel development, acquisitions and capital markets.'),
  (11, '00000011-5eed-4000-8000-000000000011', 'mateo_alvarez', 'Mateo Álvarez', 'creative', 'Architect of coastal residences', 'Principal Architect', 'Estudio Álvarez (Demo)', 'Architecture', 'Madrid, Spain', '{architecture,design,villas}', '{Residential architecture,Sustainable design,Interiors}', '{partnerships,speaking}', 'Designs low-impact coastal homes in Spain and Portugal.'),
  (12, '00000012-5eed-4000-8000-000000000012', 'hannah_weiss', 'Hannah Weiss', 'investor', 'Family office principal focused on real assets', 'Principal', 'Weiss Family Office (Demo)', 'Private Wealth', 'Zurich, Switzerland', '{art,real estate,philanthropy}', '{Asset allocation,Real assets,Philanthropy}', '{investing,introductions}', 'Third-generation steward of a family office investing in real assets and art.'),
  (13, '00000013-5eed-4000-8000-000000000013', 'omar_haddad', 'Omar Haddad', 'executive', 'Managing Director, Gulf residential development', 'Managing Director', 'Gulf Real Estate Partners (Demo)', 'Real Estate', 'Dubai, UAE', '{real estate,supercars,golf}', '{Development,Investment,Negotiation}', '{partnerships,investing}', 'Develops branded residences across the Gulf.'),
  (14, '00000014-5eed-4000-8000-000000000014', 'chloe_martin', 'Chloé Martin', 'public_figure', 'Olympic sailor and ocean advocate', 'Professional sailor', 'Independent (Demo)', 'Sport', 'Monaco', '{sailing,oceans,yachting}', '{Offshore racing,Public speaking,Ocean conservation}', '{speaking,partnerships}', 'Two-time Olympian campaigning for cleaner oceans.'),
  (15, '00000015-5eed-4000-8000-000000000015', 'daniel_osei', 'Daniel Osei', 'founder', 'Founder building cross-border payments for SMEs', 'Founder & CEO', 'Kente Capital (Demo)', 'Fintech', 'Accra, Ghana', '{fintech,venture,football}', '{Payments,Regulation,Fundraising}', '{investing,hiring,mentoring}', 'Building payments infrastructure for African small businesses.'),
  (16, '00000016-5eed-4000-8000-000000000016', 'isla_mackenzie', 'Isla MacKenzie', 'professional', 'Private aviation consultant', 'Aviation consultant', 'MacKenzie Aviation Advisory (Demo)', 'Aviation', 'Edinburgh, UK', '{aviation,travel,whisky}', '{Aircraft acquisition,Charter operations,Compliance}', '{advisory,introductions}', 'Advises owners on aircraft acquisition and charter management.'),
  (17, '00000017-5eed-4000-8000-000000000017', 'raphael_costa', 'Raphael Costa', 'executive', 'CEO of a performance car importer', 'Chief Executive Officer', 'Costa Motors (Demo)', 'Automotive', 'São Paulo, Brazil', '{supercars,motorsport,design}', '{Distribution,Brand building,Retail}', '{partnerships,board_roles}', 'Runs a performance and electric car import business across Latin America.'),
  (18, '00000018-5eed-4000-8000-000000000018', 'mei_lin', 'Mei Lin', 'creative', 'Fashion designer and atelier founder', 'Creative Director', 'Atelier Mei (Demo)', 'Fashion', 'Shanghai, China', '{fashion,art,textiles}', '{Couture,Creative direction,Brand storytelling}', '{partnerships,speaking}', 'Couture designer working with heritage textile makers.'),
  (19, '00000019-5eed-4000-8000-000000000019', 'arjun_mehta', 'Arjun Mehta', 'investor', 'Angel investor in climate technology', 'Angel investor', 'Independent (Demo)', 'Climate', 'Bengaluru, India', '{climate,venture,cricket}', '{Climate tech,Angel investing,Product strategy}', '{investing,mentoring}', 'Former operator now backing climate founders at pre-seed.'),
  (20, '00000020-5eed-4000-8000-000000000020', 'victoria_hale', 'Victoria Hale', 'executive', 'CMO for a heritage luxury house', 'Chief Marketing Officer', 'Hale & Co (Demo)', 'Luxury Retail', 'New York, USA', '{luxury,art,travel}', '{Brand strategy,Clienteling,Digital}', '{advisory,speaking,board_roles}', 'Leads brand and clienteling for a heritage jewellery house.'),
  (21, '00000021-5eed-4000-8000-000000000021', 'tomas_novak', 'Tomáš Novák', 'professional', 'M&A lawyer for founder-led companies', 'Partner', 'Novák Legal (Demo)', 'Legal', 'Prague, Czechia', '{law,classical music,cycling}', '{M&A,Corporate law,Negotiation}', '{advisory,introductions}', 'Advises founders and families on acquisitions and succession.'),
  (22, '00000022-5eed-4000-8000-000000000022', 'leila_farahani', 'Leila Farahani', 'founder', 'Founder of boutique hotels in historic buildings', 'Founder', 'Saffron Hospitality (Demo)', 'Hospitality', 'London, UK', '{hospitality,architecture,food}', '{Hotel development,Restoration,Guest experience}', '{investing,partnerships,hiring}', 'Restores historic buildings into small hotels.'),
  (23, '00000023-5eed-4000-8000-000000000023', 'henrik_berg', 'Henrik Berg', 'professional', 'Yacht broker for sailing and expedition yachts', 'Senior Broker', 'Berg Yachting (Demo)', 'Yachting', 'Oslo, Norway', '{yachting,expeditions,photography}', '{Yacht brokerage,Valuation,Refit}', '{introductions,partnerships}', 'Specialises in expedition and sailing yachts.'),
  (24, '00000024-5eed-4000-8000-000000000024', 'nadia_petrova', 'Nadia Petrova', 'creative', 'Art advisor and curator', 'Art Advisor', 'Petrova Art Advisory (Demo)', 'Art', 'Vienna, Austria', '{art,collecting,opera}', '{Collection building,Curation,Provenance}', '{advisory,speaking}', 'Helps private collectors build focused collections.'),
  (25, '00000025-5eed-4000-8000-000000000025', 'samuel_adeyemi', 'Samuel Adeyemi', 'founder', 'Founder of a port logistics platform', 'Founder & CEO', 'Harbour Logistics (Demo)', 'Logistics', 'Cape Town, South Africa', '{logistics,venture,rugby}', '{Logistics,Operations,Fundraising}', '{investing,hiring}', 'Digitising cargo handling in African ports.'),
  (26, '00000026-5eed-4000-8000-000000000026', 'giulia_romano', 'Giulia Romano', 'executive', 'Head of private banking', 'Head of Private Banking', 'Banca Alpina (Demo)', 'Private Wealth', 'Geneva, Switzerland', '{wealth,art,skiing}', '{Wealth management,Succession planning,Client relations}', '{advisory,board_roles}', 'Leads a private banking team serving entrepreneurs and families.'),
  (27, '00000027-5eed-4000-8000-000000000027', 'ethan_brooks', 'Ethan Brooks', 'investor', 'Growth investor in software and marketplaces', 'Partner', 'Blue Ridge Growth (Demo)', 'Venture Capital', 'San Francisco, USA', '{venture,software,surfing}', '{Growth equity,Marketplaces,Pricing}', '{investing,board_roles,mentoring}', 'Growth-stage investor in software and marketplaces.'),
  (28, '00000028-5eed-4000-8000-000000000028', 'yasmin_karim', 'Yasmin Karim', 'business', 'Owner of a private experiences company in Morocco', 'Owner', 'Desert Rose Experiences (Demo)', 'Experiences', 'Marrakech, Morocco', '{travel,food,design}', '{Experience design,Hospitality,Logistics}', '{partnerships}', 'Designs private journeys through Morocco.'),
  (29, '00000029-5eed-4000-8000-000000000029', 'noah_fischer', 'Noah Fischer', 'business', 'Owner of a private jet charter operator', 'Managing Director', 'Alpine Jet Partners (Demo)', 'Aviation', 'Munich, Germany', '{aviation,skiing,motorsport}', '{Charter operations,Safety,Fleet planning}', '{partnerships}', 'Operates a small fleet of light and midsize jets.'),
  (30, '00000030-5eed-4000-8000-000000000030', 'aria_shah', 'Aria Shah', 'business', 'Founder of a supercar rental and experience house', 'Founder', 'Velocity Supercars (Demo)', 'Automotive', 'Dubai, UAE', '{supercars,motorsport,travel}', '{Fleet management,Customer experience,Partnerships}', '{partnerships,hiring}', 'Curates supercar rentals and track experiences.');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', replace(d.handle, '_', '.') || '@seed.elvora.test',
  extensions.crypt('ElvoraLocal2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', d.name),
  now() - make_interval(days => 60 - d.n), now(),
  '', '', '', ''
from demo_people d;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
join demo_people d on d.id = u.id;

update public.profiles p set
  handle = d.handle,
  display_name = d.name,
  headline = d.headline,
  bio = 'Demo profile — ' || d.bio,
  job_title = d.job_title,
  company = d.company,
  industry = d.industry,
  location = d.location,
  interests = d.interests,
  skills = d.skills,
  open_to = d.open_to,
  member_type = d.member_type::public.member_type,
  profile_visibility = (case when d.n % 5 = 0 then 'public' else 'members' end)::public.visibility,
  onboarding_completed_at = now() - make_interval(days => 59 - d.n)
from demo_people d
where p.id = d.id;

-- The five base seed accounts are fictional too; mark them the same way.
update public.profiles set bio = 'Demo profile — ' || coalesce(headline, display_name)
where id in (
  '00000001-5eed-4000-8000-000000000001', '00000002-5eed-4000-8000-000000000002', '00000003-5eed-4000-8000-000000000003',
  '00000004-5eed-4000-8000-000000000004', '00000005-5eed-4000-8000-000000000005'
);
update public.profiles set member_type = 'founder', skills = '{Design,Brand building,Retail}', open_to = '{partnerships,speaking}'
where id = '00000002-5eed-4000-8000-000000000002';
update public.profiles set member_type = 'investor', skills = '{Venture capital,Due diligence}', open_to = '{investing,mentoring}'
where id = '00000003-5eed-4000-8000-000000000003';
update public.profiles set member_type = 'business' where id = '00000004-5eed-4000-8000-000000000004';
update public.profiles set member_type = 'creative', skills = '{Architecture,Sustainable design}' where id = '00000005-5eed-4000-8000-000000000005';

-- Work history: current role for everyone, a previous role for every other member.
insert into public.profile_experiences (profile_id, title, company, location, starts_on, ends_on, description, position)
select d.id, d.job_title, d.company, d.location, (current_date - make_interval(years => 2 + d.n % 6))::date, null,
  'Demo experience entry.', 0
from demo_people d;
insert into public.profile_experiences (profile_id, title, company, location, starts_on, ends_on, description, position)
select d.id, 'Senior Associate', 'Harbourline Partners (Demo)', d.location,
  (current_date - make_interval(years => 8 + d.n % 4))::date, (current_date - make_interval(years => 2 + d.n % 6))::date,
  'Demo experience entry.', 1
from demo_people d
where d.n % 2 = 0;

-- Memberships and trusted badges (normally from payment webhooks and staff review).
insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end)
select d.id,
  case when d.member_type = 'business' then 'business' when d.n % 3 = 0 then 'professional' else 'premium' end,
  'stripe', 'seed_sub_' || d.handle, 'active', now() + interval '30 days'
from demo_people d;

insert into public.verifications (user_id, kind, status, statement, reviewed_at)
select d.id,
  (case when d.member_type = 'public_figure' then 'public_figure' when d.member_type = 'executive' then 'executive' else 'identity' end)::public.verification_kind,
  'approved', 'Demo verification', now()
from demo_people d
where d.n % 2 = 0 or d.member_type in ('executive', 'public_figure', 'business');

-- -----------------------------------------------------------------------------
-- Network: connections (accepted + a few pending) and follows among demo members 2–30.
-- -----------------------------------------------------------------------------
create temporary table demo_ids as
select n, (lpad(n::text, 8, '0') || '-5eed-4000-8000-' || lpad(n::text, 12, '0'))::uuid as id
from generate_series(2, 30) n;

insert into public.connections (requester_id, addressee_id, status, responded_at, created_at)
select a.id, b.id,
  (case when (a.n + b.n) % 4 = 0 then 'accepted' else 'pending' end)::public.connection_status,
  case when (a.n + b.n) % 4 = 0 then now() - make_interval(days => (a.n * b.n) % 40) end,
  now() - make_interval(days => 1 + (a.n * b.n) % 45)
from demo_ids a
join demo_ids b on b.n > a.n and b.n - a.n <= 12
where ((a.n + b.n) % 4 = 0 or (a.n + b.n) % 7 = 0)
  and not (a.n = 2 and b.n in (3, 5));

insert into public.follows (follower_id, followee_id, created_at)
select a.id, b.id, now() - make_interval(days => (a.n + b.n) % 30)
from demo_ids a
join demo_ids b on b.n <> a.n
where (a.n * 7 + b.n) % 6 = 0;

-- -----------------------------------------------------------------------------
-- 48 demo posts (+2 from seed.sql = 50). Mentions use real demo handles.
-- -----------------------------------------------------------------------------
create temporary table demo_posts (author int, body text, visibility text, hours_ago int);
insert into demo_posts values
  (6, 'Opened our third preventive-care clinic in Lagos this week. Early screening changes outcomes — and economics. #healthtech #impact', 'public', 3),
  (7, 'What we look for in a consumer brand at seed: repeat purchase, founder taste, and a reason to exist beyond the product. #venture', 'members', 5),
  (8, 'Our first methanol-ready vessel completed sea trials. Decarbonising short-sea shipping is an operations problem as much as a technology one. #sustainability', 'public', 7),
  (9, 'Quiet robots are a design constraint, not a feature. Ours now deliver room service at under 40 dB. #robotics #hospitality', 'members', 9),
  (10, 'Hotel valuations in Southeast Asia are diverging sharply by brand strength. Happy to compare notes with fellow CFOs. #hospitality', 'connections', 11),
  (11, 'Finished site visits for a cliffside residence in Comporta. The brief: disappear into the dunes. #architecture #design', 'public', 13),
  (12, 'Our family office is spending more time on stewardship than returns this year. Thoughtful conversations with @nadia_petrova on long-term art collecting.', 'members', 15),
  (13, 'Branded residences continue to outperform in the Gulf. Design and service matter more than square metres. #realestate', 'members', 18),
  (14, 'Back from three weeks offshore. The plastic counts in the open ocean were worse than last season. Thank you to everyone supporting the research crew. #oceans #sailing', 'public', 20),
  (15, 'Cross-border payments for small businesses still take days. We cut it to minutes in two new corridors this month. #fintech', 'public', 22),
  (16, 'Thinking of buying a first aircraft? Start with the mission profile, not the aircraft. Range and runway decide everything. #aviation', 'members', 24),
  (17, 'Electric GT demand in São Paulo surprised us this quarter. Our clients want silence and torque. #supercars #ev', 'members', 26),
  (18, 'New capsule collection woven with a fourth-generation silk workshop in Suzhou. Heritage deserves a future. #fashion', 'public', 28),
  (19, 'Backed two pre-seed climate founders this month: grid storage and low-carbon cement. Always happy to meet more. #climate', 'members', 30),
  (20, 'Clienteling is a relationship, not a CRM field. The best houses remember what matters to people. #luxury', 'members', 33),
  (21, 'Succession is the deal nobody plans for. Founders: start the conversation five years before you think you need to.', 'connections', 36),
  (22, 'We restored a 1790s townhouse into twelve rooms. Every original beam kept. Opening in spring. #hospitality #architecture', 'public', 38),
  (23, 'Expedition yachts are the fastest-growing segment I cover. Owners want range and autonomy, not just length. #yachting', 'members', 40),
  (24, 'A collection with a point of view will always outlast one built on trends. #art #collecting', 'public', 42),
  (25, 'Port congestion is a data problem. We now give importers live berth-level visibility in Cape Town. #logistics', 'members', 45),
  (26, 'The most valuable thing a private banker gives a family is a plan the next generation understands.', 'members', 48),
  (27, 'Marketplace founders: liquidity first, monetisation second. Congratulations to @daniel_osei on the new corridors.', 'members', 50),
  (28, 'Hosted a private dinner in the Agafay desert last night for twelve guests. Lanterns, silence and a sky full of stars. #travel', 'public', 52),
  (29, 'Our light jets are now flying on sustainable aviation fuel blends from Munich. Small steps, measurable ones. #aviation', 'public', 55),
  (30, 'Track day at Yas Marina for our members next month. Instruction first, speed second. #supercars #motorsport', 'members', 58),
  (2, 'Sketching the spring collection on the lake this morning. Grateful for this community of makers. #design', 'public', 60),
  (3, 'Founder dinners this quarter focus on climate and hospitality. @arjun_mehta and @leila_farahani, would love your take.', 'members', 62),
  (5, 'Lisbon light is an architect''s best material. #architecture', 'public', 65),
  (6, 'Hiring a head of clinical operations in Lagos. Introductions welcome. #hiring', 'members', 70),
  (7, 'Paris consumer founders: office hours this Friday. Bring your numbers and your doubts.', 'members', 75),
  (9, 'Spent the week with @priya_raman and her team testing our robots in real hotel service. Humbling and useful.', 'members', 80),
  (11, 'Natural lime plaster, local stone, cross ventilation. Old techniques, new comfort. #design', 'public', 85),
  (12, 'Impact and returns are not opposites when the horizon is fifty years.', 'members', 90),
  (13, 'Looking for a hospitality partner for a waterfront project. Serious conversations only. #realestate', 'connections', 95),
  (14, 'Sailing is the best teacher of humility I know. #sailing', 'public', 100),
  (16, 'Charter or own? Under 200 flight hours a year, charter almost always wins.', 'members', 105),
  (18, 'Craft is a form of patience.', 'public', 110),
  (19, 'The best climate companies sell savings, not virtue.', 'members', 115),
  (20, 'Thank you to everyone who joined our Fifth Avenue preview. @mei_lin, your pieces stole the evening.', 'members', 120),
  (22, 'Small hotels, big hearts. Twelve rooms means we know every guest by name.', 'public', 125),
  (23, 'Sea trials in the fjords this week. Cold, clear and perfect.', 'public', 130),
  (24, 'Provenance research saved a client from an expensive mistake this month. Always do the work. #art', 'members', 135),
  (25, 'Raising our Series A. Investors who understand infrastructure, let''s talk.', 'connections', 140),
  (26, 'Geneva wealth forum next week. Topic: preparing heirs, not just assets.', 'members', 145),
  (27, 'Pricing is the most under-used lever in software. Test it before you raise.', 'members', 150),
  (28, 'Atlas Mountains retreat bookings open for spring. Private, quiet and unhurried. #travel', 'public', 155),
  (29, 'Safety culture is invisible until it isn''t. Proud of our crews.', 'members', 160),
  (30, 'New arrival in the fleet this week. Details for members on the marketplace. #supercars', 'members', 165);

insert into public.posts (author_id, body, visibility, created_at, updated_at)
select i.id, p.body, p.visibility::public.visibility,
  now() - make_interval(hours => p.hours_ago), now() - make_interval(hours => p.hours_ago)
from demo_posts p
join demo_ids i on i.n = p.author;

-- Likes and comments (counters are maintained by triggers).
create temporary table demo_ranked_posts as
select p.id, p.author_id, row_number() over (order by p.created_at desc, p.id) as rk
from public.posts p;

insert into public.post_likes (post_id, user_id, created_at)
select p.id, u.id, now() - make_interval(mins => (p.rk * u.n)::int % 600)
from demo_ranked_posts p
join demo_ids u on u.id <> p.author_id
where (p.rk + u.n * 3) % 5 = 0;

create temporary table demo_comments (k int, body text);
insert into demo_comments values
  (1, 'Congratulations — well deserved.'), (2, 'Would love to learn more. Sending you a message.'),
  (3, 'Completely agree with this.'), (4, 'This matches what we are seeing in our market too.'),
  (5, 'Great perspective, thank you for sharing.'), (6, 'Count me in for the next one.'),
  (7, 'Beautiful work.'), (8, 'Happy to make an introduction if useful.'),
  (9, 'Which corridors are next?'), (10, 'Bookmarking this for our team offsite.');

insert into public.post_comments (post_id, author_id, body, created_at)
select p.id, u.id, c.body, now() - make_interval(mins => (p.rk * 7 + u.n)::int % 500)
from demo_ranked_posts p
join demo_ids u on u.id <> p.author_id and (p.rk + u.n) % 9 = 0
join demo_comments c on c.k = 1 + (p.rk + u.n) % 10
where p.rk <= 40;

-- -----------------------------------------------------------------------------
-- 15 active stories. Paths sit in each author's own folder as the schema requires; the
-- media files are not shipped with the seed, so the viewer shows "media unavailable".
-- -----------------------------------------------------------------------------
insert into public.stories (author_id, media_path, media_type, caption, visibility, created_at, expires_at)
select i.id, i.id::text || '/story_image/demo-' || s.k || '.jpg', 'image', s.caption,
  (case when s.k % 4 = 0 then 'connections' else 'members' end)::public.visibility,
  now() - make_interval(hours => s.k), now() - make_interval(hours => s.k) + interval '24 hours'
from (values
  (1, 6, 'Clinic opening day.'), (2, 8, 'Sea trials.'), (3, 11, 'Site visit, Comporta.'),
  (4, 14, 'Back on the water.'), (5, 18, 'Studio, Shanghai.'), (6, 22, 'Restoration progress.'),
  (7, 23, 'Fjords this morning.'), (8, 28, 'Desert dinner setup.'), (9, 29, 'Pre-flight checks.'),
  (10, 30, 'New arrival.'), (11, 2, 'Lake Como light.'), (12, 13, 'Waterfront site.'),
  (13, 20, 'Preview night.'), (14, 24, 'Gallery walk.'), (15, 9, 'Testing in service.')
) as s (k, author, caption)
join demo_ids i on i.n = s.author;

-- -----------------------------------------------------------------------------
-- Marketplace: 4 approved demo businesses and 12 more listings (15 in total with seed.sql).
-- -----------------------------------------------------------------------------
update public.businesses set name = 'Azure Coast Collection (Demo)'
where id = '22222222-0000-4000-8000-000000000001';

insert into public.businesses (id, owner_id, name, slug, category, description, location, status, reviewed_at) values
  ('22222222-0000-4000-8000-000000000002', '00000028-5eed-4000-8000-000000000028', 'Desert Rose Experiences (Demo)', 'desert-rose-experiences-demo',
   'experiences', 'Demo business — fictional private experiences in Morocco for local development.', 'Marrakech, Morocco', 'approved', now()),
  ('22222222-0000-4000-8000-000000000003', '00000029-5eed-4000-8000-000000000029', 'Alpine Jet Partners (Demo)', 'alpine-jet-partners-demo',
   'aviation', 'Demo business — fictional private jet charter operator for local development.', 'Munich, Germany', 'approved', now()),
  ('22222222-0000-4000-8000-000000000004', '00000030-5eed-4000-8000-000000000030', 'Velocity Supercars (Demo)', 'velocity-supercars-demo',
   'automotive', 'Demo business — fictional supercar rentals for local development.', 'Dubai, UAE', 'approved', now());

-- Private aviation uses the 'aviation' category when the enum has it (added by a later
-- migration); otherwise those listings fall back to 'experience'.
insert into public.listings (business_id, title, slug, category, summary, description, city, country, price_from_minor, currency, price_unit,
  amenities, visibility, status, approved_at, published_at)
select ('22222222-0000-4000-8000-00000000000' || l.biz)::uuid, l.title, l.slug,
  (case when l.cat = 'aviation' and not exists (
     select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'listing_category' and e.enumlabel = 'aviation'
   ) then 'experience' else l.cat end)::public.listing_category,
  'Demo listing — ' || l.summary,
  'Fictional listing for local development. ' || l.summary,
  l.city, l.country, l.price, l.currency, l.unit::public.price_unit, l.amenities,
  l.visibility::public.listing_visibility, 'published', now() - make_interval(days => l.age), now() - make_interval(days => l.age)
from (values
  (1, 'Le Cap Suites', 'le-cap-suites-demo', 'hotel', 'Eighteen sea-view suites on a private headland.', 'Saint-Jean-Cap-Ferrat', 'France', 180000, 'EUR', 'night', '{spa,sea-view,concierge}'::text[], 'public', 2),
  (1, 'Domaine des Pins', 'domaine-des-pins-demo', 'resort', 'A pine-forest resort with vineyards and a lap pool.', 'Ramatuelle', 'France', 95000, 'EUR', 'night', '{vineyard,pool,tennis}', 'public', 4),
  (1, 'Villa Saint-Clair', 'villa-saint-clair-demo', 'villa', 'Five-bedroom villa above the Croisette.', 'Cannes', 'France', 320000, 'EUR', 'night', '{pool,chef,cinema}', 'members', 6),
  (1, 'Sunset Sailing Catamaran', 'sunset-sailing-catamaran-demo', 'yacht', 'A 24m sailing catamaran for evening charters.', 'Antibes', 'France', 650000, 'EUR', 'day', '{crew,paddleboards}', 'public', 3),
  (4, 'V12 Grand Tourer Weekend', 'v12-grand-tourer-weekend-demo', 'supercar', 'A weekend with a V12 grand tourer, delivered to your door.', 'Dubai', 'UAE', 450000, 'AED', 'day', '{delivery,insurance}', 'members', 1),
  (4, 'Hypercar Collection Drive', 'hypercar-collection-drive-demo', 'supercar', 'Drive three hypercars on closed mountain roads with an instructor.', 'Ras Al Khaimah', 'UAE', 1500000, 'AED', 'person', '{instructor,photography}', 'members', 5),
  (4, 'Electric GT Monthly Lease', 'electric-gt-monthly-lease-demo', 'supercar', 'A flexible monthly lease on an electric grand tourer.', 'Dubai', 'UAE', 3500000, 'AED', 'month', '{maintenance,charging}', 'public', 9),
  (3, 'Light Jet Charter: Munich – Nice', 'light-jet-munich-nice-demo', 'aviation', 'One-way light jet charter for up to six passengers.', 'Munich', 'Germany', 1400000, 'EUR', 'total', '{catering,lounge}', 'members', 2),
  (3, 'Transatlantic Heavy Jet', 'transatlantic-heavy-jet-demo', 'aviation', 'Heavy jet charter for up to fourteen passengers, Europe to New York.', 'Munich', 'Germany', 9500000, 'EUR', 'total', '{bedroom,wifi,cabin-crew}', 'members', 7),
  (3, 'Helicopter Transfer: Nice – Monaco', 'helicopter-nice-monaco-demo', 'aviation', 'Seven-minute helicopter transfer with ground handling.', 'Nice', 'France', 180000, 'EUR', 'total', '{ground-handling}', 'public', 3),
  (2, 'Atlas Mountains Private Retreat', 'atlas-mountains-retreat-demo', 'experience', 'Three nights in a private kasbah with a mountain guide.', 'Imlil', 'Morocco', 420000, 'EUR', 'total', '{guide,chef,hammam}', 'public', 8),
  (2, 'Dinner Under the Desert Stars', 'desert-stars-dinner-demo', 'experience', 'A private dinner for up to twelve in the Agafay desert.', 'Marrakech', 'Morocco', 250000, 'EUR', 'event', '{chef,musicians,transfers}', 'public', 1)
) as l (biz, title, slug, cat, summary, city, country, price, currency, unit, amenities, visibility, age);

-- -----------------------------------------------------------------------------
-- 10 published upcoming events with RSVPs.
-- -----------------------------------------------------------------------------
create temporary table demo_events (k int, host int, title text, summary text, format text, venue text, city text, country text, in_days int, hours int, capacity int, visibility text);
insert into demo_events values
  (1, 7, 'Founders & Funders Breakfast', 'An informal breakfast for consumer founders and early-stage investors.', 'in_person', 'Hôtel Particulier (Demo)', 'Paris', 'France', 5, 2, 30, 'members'),
  (2, 14, 'Ocean Conservation Evening', 'A talk on open-ocean plastic research, followed by drinks.', 'hybrid', 'Yacht Club (Demo)', 'Monaco', 'Monaco', 9, 3, 80, 'members'),
  (3, 22, 'Restoring Historic Hotels', 'A walk-through of a townhouse restoration with the architects.', 'in_person', 'Saffron House (Demo)', 'London', 'UK', 12, 2, 20, 'members'),
  (4, 19, 'Climate Founders Office Hours', 'Short one-to-one sessions with climate investors.', 'virtual', null, null, null, 3, 2, 40, 'members'),
  (5, 30, 'Members Track Day', 'Instruction-first track day for members.', 'in_person', 'Yas Marina Circuit', 'Abu Dhabi', 'UAE', 21, 6, 16, 'members'),
  (6, 24, 'Private Collectors Salon', 'An evening on building a focused collection.', 'in_person', 'Petrova Gallery (Demo)', 'Vienna', 'Austria', 15, 3, 25, 'invite_only'),
  (7, 13, 'Gulf Real Estate Roundtable', 'Branded residences and hospitality partnerships.', 'in_person', 'DIFC (Demo venue)', 'Dubai', 'UAE', 18, 3, 40, 'members'),
  (8, 26, 'Preparing the Next Generation', 'Succession planning for entrepreneurial families.', 'hybrid', 'Banca Alpina (Demo)', 'Geneva', 'Switzerland', 25, 3, 60, 'members'),
  (9, 29, 'Sustainable Aviation Briefing', 'What SAF blends mean for private flying.', 'virtual', null, null, null, 7, 1, 100, 'members'),
  (10, 28, 'Desert Supper Club', 'A long-table dinner in the Agafay desert.', 'in_person', 'Agafay camp (Demo)', 'Marrakech', 'Morocco', 30, 4, 12, 'members');

insert into public.events (id, host_id, title, summary, description, format, venue_name, city, country, starts_at, ends_at, capacity, visibility, status)
select ('33333333-0000-4000-8000-' || lpad(e.k::text, 12, '0'))::uuid, i.id, e.title, e.summary,
  'Demo event — fictional, for local development. ' || e.summary,
  e.format::public.event_format, e.venue, e.city, e.country,
  date_trunc('hour', now()) + make_interval(days => e.in_days, hours => 18),
  date_trunc('hour', now()) + make_interval(days => e.in_days, hours => 18 + e.hours),
  e.capacity, e.visibility::public.event_visibility, 'published'
from demo_events e
join demo_ids i on i.n = e.host;

insert into public.event_private_details (event_id, online_url)
select ('33333333-0000-4000-8000-' || lpad(e.k::text, 12, '0'))::uuid, 'https://meet.example.test/demo-event-' || e.k
from demo_events e
where e.format in ('virtual', 'hybrid');

insert into public.event_rsvps (event_id, user_id, status)
select ('33333333-0000-4000-8000-' || lpad(e.k::text, 12, '0'))::uuid, i.id,
  (case when (e.k + i.n) % 3 = 0 then 'interested' else 'going' end)::public.rsvp_status
from demo_events e
join demo_ids i on i.n <> e.host and (e.k * 5 + i.n) % 4 = 0;

drop table demo_events, demo_comments, demo_ranked_posts, demo_posts, demo_ids, demo_people;
