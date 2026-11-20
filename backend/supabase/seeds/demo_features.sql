-- =============================================================================
-- ELVORA DEVELOPMENT DEMO DATASET — FEATURE SHOWCASE. FICTIONAL DATA ONLY.
-- NEVER LOAD INTO PRODUCTION.
--
-- * Runs after seed.sql, demo.sql and demo_communities.sql (`supabase db reset` loads
--   seeds/*.sql in name order). Only for a LOCAL stack or a separate STAGING project.
--   `supabase db push` never runs seed files.
-- * Adds a fully filled showcase account and gives every feature something to click through:
--   business + listing, Ads Manager (account, balance, campaigns, ad set, creatives, audience,
--   delivered impressions), messages (with a reaction and an unsent message), introductions in
--   several states, vouches and a vouch request, a deal room behind an NDA, private contact
--   notes and reminders, opportunities, a poll, collections, an invitation, communities,
--   event RSVPs and the notifications all of that produces.
-- * Wherever an app function exists for an action it is called as the acting member (auth.uid()
--   comes from request.jwt.claim.sub), so counters, conversations, notifications and audit rows
--   are produced exactly as in the app.
-- * Not seeded: reels (a reel row requires its uploaded video file in Storage) and deal-room
--   documents (same: a real uploaded file is required). Business verification documents are
--   recorded as paths only; the files don't exist, so reviewers see "file unavailable".
-- * Showcase login: instastrategix@seed.elvora.test / ElvoraLocal2026 (handle @instastrategix_demo).
-- =============================================================================

do $$
begin
  if exists (select 1 from auth.users where email not like '%@seed.elvora.test') then
    raise exception 'ELVORA demo seed refused: database contains non-seed users';
  end if;
end;
$$;

-- Acts as a member for the app functions below (auth.uid() reads request.jwt.claim.sub).
-- No role claim is set, so helper functions treat these calls as trusted internal calls.
create or replace function pg_temp.act_as(p uuid) returns void
language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub', p)::text end, false);
end;
$f$;

-- Member id helper matching demo.sql: n -> 0000000n-5eed-4000-8000-00000000000n.
create or replace function pg_temp.member(n int) returns uuid
language sql immutable as $f$
  select (lpad(n::text, 8, '0') || '-5eed-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$f$;

-- -----------------------------------------------------------------------------
-- Showcase account (member 31). The auth trigger creates the profile.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '00000031-5eed-4000-8000-000000000031', 'authenticated', 'authenticated',
  'instastrategix@seed.elvora.test', extensions.crypt('ElvoraLocal2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"InstaStrategix (Demo)"}', now() - interval '90 days', now(),
  '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u where u.id = '00000031-5eed-4000-8000-000000000031';

update public.profiles set
  handle = 'instastrategix_demo',
  display_name = 'InstaStrategix (Demo)',
  headline = 'Digital growth studio for luxury and hospitality brands',
  bio = 'Demo profile — A fictional growth studio used to showcase every ELVORA feature: brand strategy, paid social and creator partnerships for premium hospitality, real estate and lifestyle brands.',
  job_title = 'Founder & Strategy Director',
  company = 'InstaStrategix Studio (Demo)',
  industry = 'Marketing & Advertising',
  location = 'Mumbai, India',
  interests = '{marketing,hospitality,luxury,design,travel}',
  skills = '{Brand strategy,Paid social,Creator partnerships,Analytics,Content production}',
  open_to = '{partnerships,advisory,speaking,introductions}',
  achievements = '{Grew a boutique hotel group''s direct bookings 3x in a year (fictional),Speaker at a regional marketing summit (fictional),Built a 40-creator partner network (fictional)}',
  member_type = 'founder',
  profile_visibility = 'members',
  onboarding_completed_at = now() - interval '89 days'
where id = '00000031-5eed-4000-8000-000000000031';

insert into public.profile_experiences (profile_id, title, company, location, starts_on, ends_on, description, position) values
  ('00000031-5eed-4000-8000-000000000031', 'Founder & Strategy Director', 'InstaStrategix Studio (Demo)', 'Mumbai, India',
   (current_date - interval '4 years')::date, null, 'Demo experience entry — leads strategy and client partnerships.', 0),
  ('00000031-5eed-4000-8000-000000000031', 'Head of Social', 'Harbourline Partners (Demo)', 'Bengaluru, India',
   (current_date - interval '9 years')::date, (current_date - interval '4 years')::date, 'Demo experience entry.', 1);

insert into public.profile_links (profile_id, platform, url, label, visibility, position) values
  ('00000031-5eed-4000-8000-000000000031', 'website', 'https://instastrategix.example.test', null, 'public', 0),
  ('00000031-5eed-4000-8000-000000000031', 'other', 'https://portfolio.instastrategix.example.test', 'Portfolio', 'members', 1);

-- Trusted records that normally come from staff review and payments.
insert into public.staff_roles (user_id, role) values ('00000031-5eed-4000-8000-000000000031', 'admin');
insert into public.verifications (user_id, kind, status, statement, reviewed_at) values
  ('00000031-5eed-4000-8000-000000000031', 'identity', 'approved', 'Demo verification', now());
insert into public.plan_grants (user_id, plan_id, reason, granted_by, expires_at)
select '00000031-5eed-4000-8000-000000000031', p.id, 'Demo showcase access to every plan', '00000001-5eed-4000-8000-000000000001',
  now() + interval '366 days'
from public.membership_plans p
where p.active and not p.is_free;

-- Network: accepted connections with a handful of demo members, plus followers.
insert into public.connections (requester_id, addressee_id, status, responded_at, created_at)
select '00000031-5eed-4000-8000-000000000031', pg_temp.member(n), 'accepted', now() - make_interval(days => n), now() - make_interval(days => n + 1)
from unnest(array[2, 3, 7, 10, 12, 13, 19, 22]) n;
insert into public.connections (requester_id, addressee_id, status, created_at)
values (pg_temp.member(24), '00000031-5eed-4000-8000-000000000031', 'pending', now() - interval '2 days');
insert into public.follows (follower_id, followee_id)
select pg_temp.member(n), '00000031-5eed-4000-8000-000000000031' from unnest(array[2, 6, 7, 11, 14, 20, 26]) n;

-- -----------------------------------------------------------------------------
-- Everything else, acting as the relevant member.
-- -----------------------------------------------------------------------------
do $$
declare
  me constant uuid := '00000031-5eed-4000-8000-000000000031';
  admin constant uuid := '00000001-5eed-4000-8000-000000000001';
  v_business uuid := '22222222-0000-4000-8000-000000000031';
  v_listing uuid;
  v_post uuid;
  v_poll_post uuid;
  v_opts uuid[];
  v_account uuid;
  v_campaign uuid;
  v_campaign2 uuid;
  v_set uuid;
  v_set2 uuid;
  v_creative uuid;
  v_creative2 uuid;
  v_conv uuid;
  v_conv2 uuid;
  v_msg uuid;
  v_unsent uuid;
  v_intro uuid;
  v_room uuid;
  v_opp uuid;
  v_coll uuid;
  v_imp uuid;
  k int;
begin
  -- Business (approved) with every checklist item, and one published listing.
  insert into public.businesses (id, owner_id, name, slug, category, description, location, website, contact_email,
    registration_number, evidence_paths, status, reviewed_at)
  values (v_business, me, 'InstaStrategix Studio (Demo)', 'instastrategix-studio-demo', 'experiences',
    'Demo business — A fictional growth studio for luxury hospitality and lifestyle brands: brand strategy, paid social, creator partnerships and private launch events.',
    'Mumbai, India', 'https://instastrategix.example.test', 'hello@instastrategix.example.test', 'DEMO-U74999MH2022PTC000000',
    array[me::text || '/business_evidence/demo-certificate.pdf'], 'approved', now() - interval '30 days');

  insert into public.listings (business_id, title, slug, category, summary, description, city, country, price_from_minor, currency, price_unit,
    amenities, visibility, status, approved_at, published_at)
  values (v_business, 'Private Brand Launch Evening', 'private-brand-launch-evening-demo', 'experience',
    'Demo listing — A curated launch evening for up to 60 guests with content capture.',
    'Fictional listing for development. Venue sourcing, guest curation, creators and same-night content.',
    'Mumbai', 'India', 45000000, 'INR', 'event', '{venue,creators,photography}', 'public', 'published', now(), now())
  returning id into v_listing;

  -- Posts, including a poll.
  insert into public.posts (author_id, body, visibility, created_at)
  values (me, 'Demo post — Three things luxury hotels get wrong on social: too much product, too little place, and no people. #hospitality #marketing', 'public', now() - interval '6 hours')
  returning id into v_post;
  insert into public.posts (author_id, body, visibility, created_at)
  values (me, 'Demo post — Quick poll for hospitality founders: where does your best booking come from?', 'members', now() - interval '3 hours')
  returning id into v_poll_post;
  insert into public.post_polls (post_id, question, closes_at) values (v_poll_post, 'Best source of direct bookings?', now() + interval '5 days');
  insert into public.post_poll_options (post_id, position, label) values
    (v_poll_post, 0, 'Instagram'), (v_poll_post, 1, 'Referrals'), (v_poll_post, 2, 'Search'), (v_poll_post, 3, 'Partnerships');
  select array_agg(id order by position) into v_opts from public.post_poll_options where post_id = v_poll_post;
  foreach k in array array[2, 3, 7, 10, 12, 19, 22] loop
    perform pg_temp.act_as(pg_temp.member(k));
    perform public.vote_poll(v_poll_post, array[v_opts[1 + k % 4]]);
  end loop;
  perform pg_temp.act_as(null);
  insert into public.post_likes (post_id, user_id) select v_post, pg_temp.member(x) from unnest(array[2, 7, 12, 19]) x;
  insert into public.post_comments (post_id, author_id, body) values
    (v_post, pg_temp.member(2), 'Demo comment — "No people" is so true. Guests buy the feeling.'),
    (v_post, pg_temp.member(22), 'Demo comment — Saving this for our next team offsite.');

  -- Collections.
  perform pg_temp.act_as(me);
  insert into public.collections (owner_id, name) values (me, 'Inspiration (Demo)') returning id into v_coll;
  insert into public.collection_items (collection_id, item_type, item_id)
  select v_coll, 'post', p.id from public.posts p where p.author_id in (pg_temp.member(11), pg_temp.member(22)) limit 3;
  insert into public.collection_items (collection_id, item_type, item_id)
  select v_coll, 'listing', l.id from public.listings l where l.status = 'published' and l.visibility = 'public' limit 2;

  -- Referral invitation.
  perform public.create_member_invitation(null, 'Demo invitation');

  -- Opportunities: one posted by the showcase account, one it is interested in.
  insert into public.opportunities (author_id, kind, title, summary, details, industry, location, remote, visibility)
  values (me, 'partnership', 'Hotel partners for a creator residency (Demo)',
    'Looking for two boutique hotels to host a month-long creator residency.',
    'Demo opportunity — fictional. Rooms in exchange for content and launch coverage.', 'Hospitality', 'India', true, 'members')
  returning id into v_opp;
  foreach k in array array[22, 10] loop
    perform pg_temp.act_as(pg_temp.member(k));
    insert into public.opportunity_interests (opportunity_id, user_id, note)
    values (v_opp, pg_temp.member(k), 'Demo interest — we would love to host. Happy to talk this week.');
  end loop;
  perform pg_temp.act_as(pg_temp.member(7));
  insert into public.opportunities (author_id, kind, title, summary, industry, location, visibility, amount_min_minor, amount_max_minor, currency)
  values (pg_temp.member(7), 'investment', 'Seed round for a premium travel brand (Demo)', 'Raising a seed round; looking for strategic angels.',
    'Travel', 'Paris, France', 'members', 25000000, 100000000, 'EUR')
  returning id into v_opp;
  perform pg_temp.act_as(me);
  insert into public.opportunity_interests (opportunity_id, user_id, note)
  values (v_opp, me, 'Demo interest — can help with launch marketing.');

  -- Messages: two conversations, a reaction and an unsent message.
  perform pg_temp.act_as(me);
  v_conv := public.start_conversation(pg_temp.member(2));
  insert into public.messages (conversation_id, sender_id, body, client_id, created_at) values
    (v_conv, me, 'Demo message — Isabella, loved the autumn preview. Open to a content partnership?', gen_random_uuid(), now() - interval '50 minutes');
  insert into public.messages (conversation_id, sender_id, body, client_id, created_at)
  values (v_conv, pg_temp.member(2), 'Demo message — Absolutely. Send me a short proposal?', gen_random_uuid(), now() - interval '40 minutes')
  returning id into v_msg;
  insert into public.messages (conversation_id, sender_id, body, client_id)
  values (v_conv, me, 'Demo message — Draft numbers, please ignore.', gen_random_uuid())
  returning id into v_unsent;
  insert into public.messages (conversation_id, sender_id, body, client_id)
  values (v_conv, me, 'Demo message — Proposal coming tomorrow morning.', gen_random_uuid());
  perform public.unsend_message(v_unsent);
  insert into public.message_reactions (message_id, user_id, emoji) values (v_msg, me, '👍');

  v_conv2 := public.start_conversation(pg_temp.member(7));
  insert into public.messages (conversation_id, sender_id, body, client_id) values
    (v_conv2, pg_temp.member(7), 'Demo message — Saw your note on my seed round. Coffee next week?', gen_random_uuid());

  -- Introductions in several states.
  -- 1) Showcase asks Isabella (2) to introduce them to Chloé (14): waiting for Isabella.
  perform pg_temp.act_as(me);
  perform public.request_introduction(pg_temp.member(2), pg_temp.member(14),
    'Demo request — I''d love an introduction to Chloé about an ocean-conservation campaign.');
  -- 2) Showcase asks Lucas (7) to introduce them to Kenji (9); Lucas forwards it: waiting for Kenji.
  v_intro := public.request_introduction(pg_temp.member(7), pg_temp.member(9),
    'Demo request — Kenji''s hotel robotics would make a great launch story for our clients.');
  perform pg_temp.act_as(pg_temp.member(7));
  perform public.respond_introduction_as_introducer(v_intro, true, 'Demo note — worth a call, both are thoughtful.');
  -- 3) Arjun (19) asks the showcase to introduce him to Hannah (12); forwarded and accepted.
  perform pg_temp.act_as(pg_temp.member(19));
  v_intro := public.request_introduction(me, pg_temp.member(12),
    'Demo request — Hannah''s family office invests in climate real assets; I''d value her view.');
  perform pg_temp.act_as(me);
  perform public.respond_introduction_as_introducer(v_intro, true, 'Demo note — Arjun is a sharp climate angel.');
  perform pg_temp.act_as(pg_temp.member(12));
  perform public.respond_introduction_as_target(v_intro, true);
  -- 4) Leila (22) asks the showcase to introduce her to Rohan (3): waiting for the showcase.
  perform pg_temp.act_as(pg_temp.member(22));
  perform public.request_introduction(me, pg_temp.member(3),
    'Demo request — Rohan''s fund backs hospitality; I''d love to share our restoration pipeline.');

  -- Vouches and requests.
  perform pg_temp.act_as(me);
  perform public.vouch_for(pg_temp.member(2), 'client', 'Demo vouch — a thoughtful founder and a generous collaborator.');
  perform pg_temp.act_as(pg_temp.member(7));
  perform public.vouch_for(me, 'worked_together', 'Demo vouch — ran our portfolio''s best launch campaign.');
  perform pg_temp.act_as(pg_temp.member(12));
  perform public.vouch_for(me, 'client', 'Demo vouch — clear thinking, delivers on time.');
  perform pg_temp.act_as(me);
  perform public.request_vouch(pg_temp.member(3), 'Demo request — would you vouch for our work together?');
  perform pg_temp.act_as(pg_temp.member(22));
  perform public.request_vouch(me, 'Demo request — we worked on the townhouse launch together.');

  -- Deal room behind an NDA: Isabella has joined, Lucas is invited.
  perform pg_temp.act_as(me);
  v_room := public.create_deal_room('Creator Residency Partnership (Demo)',
    'Demo deal room — terms and plans for the creator residency partnership.', true,
    'Demo NDA — Everything shared in this room is confidential and may only be used to evaluate the partnership.');
  perform public.invite_to_deal_room(v_room, pg_temp.member(2), 'member');
  perform public.invite_to_deal_room(v_room, pg_temp.member(7), 'viewer');
  perform pg_temp.act_as(pg_temp.member(2));
  perform public.join_deal_room(v_room, 1);
  insert into public.deal_room_messages (room_id, author_id, body)
  values (v_room, pg_temp.member(2), 'Demo message — Thanks for setting this up. We can host in February.');
  perform pg_temp.act_as(me);
  insert into public.deal_room_messages (room_id, author_id, body)
  values (v_room, me, 'Demo message — Welcome! Draft terms will be shared here this week.');

  -- Private contact notes and reminders (one due today, one later).
  insert into public.contact_notes (owner_id, contact_id, body, tags, stage, last_contacted_on) values
    (me, pg_temp.member(2), 'Demo note — interested in a content partnership for the autumn collection.', '{fashion,partner}', 'active', current_date - 1),
    (me, pg_temp.member(7), 'Demo note — investor; possible launch work for his portfolio.', '{investor}', 'warm', current_date - 10),
    (me, pg_temp.member(12), 'Demo note — introduced Arjun; follow up on climate real assets.', '{family-office}', 'deal', current_date - 3);
  insert into public.contact_reminders (owner_id, contact_id, due_on, body) values
    (me, pg_temp.member(7), current_date, 'Demo reminder — send Lucas the launch case study.'),
    (me, pg_temp.member(2), current_date + 5, 'Demo reminder — share the partnership proposal.');

  -- Communities and events.
  perform pg_temp.act_as(null);
  insert into public.community_members (community_id, user_id, role, status, joined_at)
  select c.id, me, 'member', 'active', now() - interval '10 days'
  from public.communities c where c.slug in ('founders-circle-demo', 'hospitality-leaders-demo')
  on conflict (community_id, user_id) do nothing;
  insert into public.event_rsvps (event_id, user_id, status)
  select e.id, me, 'going' from public.events e
  where e.id in ('33333333-0000-4000-8000-000000000001', '33333333-0000-4000-8000-000000000003')
  on conflict do nothing;

  -- ---------------------------------------------------------------------------
  -- Ads Manager: prepaid INR account with a demo credit, an approved campaign that serves,
  -- a second campaign waiting in the review queue, and a saved audience.
  -- ---------------------------------------------------------------------------
  insert into public.ad_billing_settings (currency, min_top_up_minor, max_top_up_minor) values
    ('INR', 100000, 100000000), ('USD', 5000, 5000000)
  on conflict (currency) do nothing;

  insert into public.advertiser_accounts (owner_id, display_name, billing_email, business_id, currency, timezone)
  values (me, 'InstaStrategix Studio (Demo)', 'billing@instastrategix.example.test', v_business, 'INR', 'Asia/Kolkata')
  returning id into v_account;

  perform pg_temp.act_as(me);
  perform public.ad_adjust_balance(v_account, 5000000, 'Demo credit for the staging showcase (not a real payment)');

  insert into public.ad_audiences (account_id, name, kind, definition)
  values (v_account, 'Hospitality decision-makers (Demo)', 'saved', '{"industries": ["Hospitality", "Real Estate"], "member_types": ["founder", "executive"]}');

  insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, budget_type, daily_budget_minor,
    total_budget_minor, starts_on, ends_on, structure, special_category)
  values (v_account, me, 'Studio awareness (Demo)', 'traffic', 'INR', 'daily', 100000, 3000000,
    current_date, current_date + 30, 'managed', 'none')
  returning id into v_campaign;
  insert into public.ad_sets (campaign_id, name, placements, targeting, bid_strategy, frequency_cap_per_day)
  values (v_campaign, 'Broad — members (Demo)', array['feed', 'discover', 'marketplace'], '{}', 'lowest_cost', 3)
  returning id into v_set;
  insert into public.ad_creatives (account_id, name, format, primary_text, headline, description, cta, business_id)
  values (v_account, 'Studio card (Demo)', 'business_card',
    'Demo ad — Growth strategy for luxury hospitality and lifestyle brands.', 'Grow your luxury brand (Demo)',
    'Fictional advertiser for staging.', 'learn_more', v_business)
  returning id into v_creative;
  insert into public.advertisements (ad_set_id, creative_id, name) values (v_set, v_creative, 'Studio card — feed (Demo)');
  perform public.submit_campaign_for_review(v_campaign);
  perform pg_temp.act_as(admin);
  perform public.review_ad_campaign(v_campaign, 'approved', '{}', 'Demo approval');

  perform pg_temp.act_as(me);
  insert into public.ad_campaigns (advertiser_account_id, owner_id, name, objective, currency, budget_type, daily_budget_minor,
    total_budget_minor, starts_on, ends_on, structure, special_category)
  values (v_account, me, 'Launch evening promotion (Demo)', 'awareness', 'INR', 'lifetime', 1500000, 1500000,
    current_date + 1, current_date + 14, 'managed', 'none')
  returning id into v_campaign2;
  insert into public.ad_sets (campaign_id, name, placements, targeting, bid_strategy, frequency_cap_per_day)
  values (v_campaign2, 'Hospitality founders (Demo)', array['feed', 'events'], '{"industries": ["Hospitality"]}', 'lowest_cost', 2)
  returning id into v_set2;
  insert into public.ad_creatives (account_id, name, format, primary_text, cta, post_id)
  values (v_account, 'Promoted post (Demo)', 'sponsored_post', 'Demo ad — our take on luxury hotel social.', 'learn_more', v_post)
  returning id into v_creative2;
  insert into public.advertisements (ad_set_id, creative_id, name) values (v_set2, v_creative2, 'Promoted post — feed (Demo)');
  perform public.submit_campaign_for_review(v_campaign2);

  -- Real deliveries through the ad engine so analytics have data (charged to the demo credit).
  foreach k in array array[5, 6, 8, 9, 11, 14, 16, 18, 20, 21, 23, 24] loop
    perform pg_temp.act_as(pg_temp.member(k));
    select s.impression_id into v_imp from public.serve_ads_v2('feed', 1) s limit 1;
    if v_imp is not null and k % 4 = 0 then
      perform public.record_ad_click_v2(v_imp);
    end if;
  end loop;

  perform pg_temp.act_as(null);
end;
$$;

drop function pg_temp.act_as(uuid);
drop function pg_temp.member(int);
