-- =============================================================================
-- ELVORA LOCAL DEVELOPMENT SEED — FICTIONAL DATA ONLY
--
-- * Runs only via `supabase db reset` / `supabase start` against the LOCAL stack.
--   `supabase db push` does not run seed files against hosted projects.
-- * Every person, business and listing here is fictional. Emails use the reserved
--   .test TLD and cannot receive mail.
-- * Guard: aborts if the database already contains non-seed users, so it can never
--   be applied to a populated (e.g. production) database by mistake.
-- * Local password for all seed accounts: ElvoraLocal2026  (see README "Local data")
-- =============================================================================

do $$
begin
  if exists (select 1 from auth.users where email not like '%@seed.elvora.test') then
    raise exception 'ELVORA seed refused: database contains non-seed users';
  end if;
end;
$$;

-- Local-only prices (fictional amounts for development).
insert into public.plan_prices (plan_id, currency, billing_interval, amount_minor) values
  ('premium', 'USD', 'month', 49000), ('premium', 'USD', 'year', 490000),
  ('premium', 'INR', 'month', 3900000),
  ('professional', 'USD', 'month', 89000), ('professional', 'USD', 'year', 890000),
  ('business', 'USD', 'month', 149000), ('business', 'INR', 'month', 12000000),
  ('advertiser', 'USD', 'month', 29000)
on conflict do nothing;

insert into public.ad_rate_cards (currency, objective, cpm_minor, cpc_minor) values
  ('USD', 'awareness', 2500, 0), ('USD', 'traffic', 1500, 120), ('USD', 'inquiries', 3000, 0),
  ('INR', 'awareness', 200000, 0), ('INR', 'traffic', 120000, 10000), ('INR', 'inquiries', 250000, 0)
on conflict do nothing;

-- Seed users (fictional).
with seed_users (id, email, name) as (
  values
    ('11111111-0000-4000-8000-000000000001'::uuid, 'admin@seed.elvora.test', 'Seed Admin'),
    ('11111111-0000-4000-8000-000000000002'::uuid, 'isabella@seed.elvora.test', 'Isabella Marchetti'),
    ('11111111-0000-4000-8000-000000000003'::uuid, 'rohan@seed.elvora.test', 'Rohan Kapoor'),
    ('11111111-0000-4000-8000-000000000004'::uuid, 'azure@seed.elvora.test', 'Azure Coast Collection'),
    ('11111111-0000-4000-8000-000000000005'::uuid, 'member@seed.elvora.test', 'Elena Duarte')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('ElvoraLocal2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', name), now(), now(),
  '', '', '', ''
from seed_users;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u where u.email like '%@seed.elvora.test';

update public.profiles p set
  handle = v.handle, headline = v.headline, location = v.location, interests = v.interests,
  profile_visibility = v.visibility::public.visibility, onboarding_completed_at = now()
from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'seed_admin', 'Platform administrator (seed)', 'London', '{}'::text[], 'members'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'isabella', 'Founder, Marchetti Atelier (fictional)', 'Milan', '{design,yachting,art}', 'public'),
  ('11111111-0000-4000-8000-000000000003'::uuid, 'rohan', 'Managing Partner, fictional growth fund', 'Mumbai', '{venture,supercars}', 'members'),
  ('11111111-0000-4000-8000-000000000004'::uuid, 'azure_coast', 'Boutique villas on the Riviera (fictional)', 'Nice', '{hospitality}', 'public'),
  ('11111111-0000-4000-8000-000000000005'::uuid, 'elena', 'Architect', 'Lisbon', '{architecture,travel}', 'members')
) as v (id, handle, headline, location, interests, visibility)
where p.id = v.id;

insert into public.staff_roles (user_id, role) values ('11111111-0000-4000-8000-000000000001', 'admin');

-- Trusted records that would normally arrive from staff review and payment webhooks.
insert into public.verifications (user_id, kind, status, statement, reviewed_at) values
  ('11111111-0000-4000-8000-000000000002', 'executive', 'approved', 'Seed verification', now());
insert into public.membership_applications (user_id, plan_id, status, statement, decided_at) values
  ('11111111-0000-4000-8000-000000000002', 'premium', 'approved', 'Seed application', now()),
  ('11111111-0000-4000-8000-000000000004', 'business', 'approved', 'Seed application', now()),
  ('11111111-0000-4000-8000-000000000003', 'premium', 'submitted', 'Seed application awaiting review', null);
insert into public.subscriptions (user_id, plan_id, provider, provider_subscription_id, status, current_period_end) values
  ('11111111-0000-4000-8000-000000000002', 'premium', 'stripe', 'seed_sub_isabella', 'active', now() + interval '30 days'),
  ('11111111-0000-4000-8000-000000000004', 'business', 'stripe', 'seed_sub_azure', 'active', now() + interval '30 days');

insert into public.businesses (id, owner_id, name, slug, category, description, location, website, status, reviewed_at) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000004', 'Azure Coast Collection', 'azure-coast-collection',
   'hospitality', 'A fictional collection of private villas used for local development.', 'Côte d''Azur, France',
   'https://example.test', 'approved', now());

insert into public.listings (business_id, title, slug, category, summary, description, city, country, price_from_minor, currency, price_unit,
  amenities, visibility, status, approved_at, published_at) values
  ('22222222-0000-4000-8000-000000000001', 'Villa Lumière', 'villa-lumiere', 'villa',
   'Six-bedroom clifftop villa with infinity pool (fictional).', 'Fictional listing for local development. Sea-facing terraces, private chef on request.',
   'Èze', 'France', 450000, 'EUR', 'night', '{pool,chef,sea-view}', 'public', 'published', now(), now()),
  ('22222222-0000-4000-8000-000000000001', 'Riviera Day Charter', 'riviera-day-charter', 'yacht',
   'A 32m motor yacht for day charters (fictional).', 'Fictional listing for local development.',
   'Monaco', 'Monaco', 1200000, 'EUR', 'day', '{crew,tender}', 'members', 'published', now(), now()),
  ('22222222-0000-4000-8000-000000000001', 'Penthouse Draft', 'penthouse-draft', 'apartment',
   'Draft listing visible only to its owner (fictional).', null, 'Nice', 'France', null, null, null, '{}', 'public', 'draft', null, null);

insert into public.posts (author_id, body, visibility) values
  ('11111111-0000-4000-8000-000000000002', 'Seed post: preparing the autumn collection preview in Milan. (Fictional content for local development.)', 'public'),
  ('11111111-0000-4000-8000-000000000003', 'Seed post: members-only note on this quarter''s founder dinners. (Fictional.)', 'members');

insert into public.connections (requester_id, addressee_id, status, responded_at) values
  ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'accepted', now()),
  ('11111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000002', 'pending', null);

-- Fictional invitation: code ELVORA-LOCAL-INVITE (pre-approved Premium, 50 uses).
insert into public.invitations (code_hash, plan_id, pre_approved, max_uses, expires_at) values
  (public.hash_invitation_code('ELVORA-LOCAL-INVITE'), 'premium', true, 50, now() + interval '1 year');
