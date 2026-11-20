/**
 * Loads seed.sql + seeds/*.sql on top of every migration (in the order `supabase db reset`
 * uses) and checks the development demo dataset is complete and clearly marked as demo data.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb } from "./pglite";

const SUPABASE_DIR = fileURLToPath(new URL("../../supabase", import.meta.url));

// Columns/tables of Supabase's auth schema that the seed writes but the shared harness omits,
// plus pgcrypto stand-ins (password hashing is irrelevant to these assertions).
const SEED_STUBS = `
  alter table auth.users
    add column instance_id uuid, add column aud text, add column role text,
    add column encrypted_password text, add column email_confirmed_at timestamptz,
    add column raw_app_meta_data jsonb, add column updated_at timestamptz,
    add column confirmation_token text, add column recovery_token text,
    add column email_change text, add column email_change_token_new text;
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users (id), provider_id text, identity_data jsonb,
    provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
  );
  create schema if not exists extensions;
  create function extensions.gen_salt(text) returns text language sql as $$ select 'stub-salt' $$;
  create function extensions.crypt(text, text) returns text language sql as $$ select 'stub-hash:' || $2 $$;
`;

function seedFiles(): string[] {
  const seeds = readdirSync(path.join(SUPABASE_DIR, "seeds"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join("seeds", f));
  return ["seed.sql", ...seeds];
}

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDb();
  await db.exec(SEED_STUBS);
  for (const file of seedFiles()) {
    try {
      await db.exec(readFileSync(path.join(SUPABASE_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Seed ${file} failed: ${(error as Error).message}`);
    }
  }
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function count(sql: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select (${sql})::int as n`);
  return rows[0]!.n;
}

describe("demo seed dataset", () => {
  it("loads in reset order: seed.sql first, then seeds/*.sql", () => {
    expect(seedFiles()).toEqual([
      "seed.sql",
      path.join("seeds", "demo.sql"),
      path.join("seeds", "demo_communities.sql"),
      path.join("seeds", "demo_features.sql"),
    ]);
  });

  it("has 31 onboarded professional profiles, all marked as demo", async () => {
    expect(await count(`select count(*) from public.profiles where bio like 'Demo profile —%'`)).toBeGreaterThanOrEqual(31);
    expect(await count(`select count(*) from public.profiles where onboarding_completed_at is null`)).toBe(0);
    expect(await count(`select count(*) from public.profiles where bio not like 'Demo profile —%' or bio is null`)).toBe(0);
    expect(await count(`select count(*) from public.profile_experiences`)).toBeGreaterThanOrEqual(25);
    expect(await count(`select count(*) from auth.users where email not like '%@seed.elvora.test'`)).toBe(0);
  });

  it("has a connected network with 52 posts, likes, comments and mentions", async () => {
    expect(await count(`select count(*) from public.posts`)).toBe(52);
    expect(await count(`select count(*) from public.connections where status = 'accepted'`)).toBeGreaterThan(20);
    expect(await count(`select count(*) from public.follows`)).toBeGreaterThan(20);
    expect(await count(`select count(*) from public.post_likes`)).toBeGreaterThan(50);
    expect(await count(`select count(*) from public.post_comments`)).toBeGreaterThan(10);
    // Counters are maintained by triggers, not written by the seed.
    expect(await count(`select count(*) from public.posts p where p.like_count <> (select count(*) from public.post_likes l where l.post_id = p.id)`)).toBe(0);
    expect(await count(`select count(*) from public.posts where body ~ '@[a-z0-9_]{3,30}'`)).toBeGreaterThanOrEqual(5);
  });

  it("has 15 active stories stored in each author's own folder", async () => {
    expect(await count(`select count(*) from public.stories where expires_at > now()`)).toBe(15);
    expect(await count(`select count(*) from public.stories where split_part(media_path, '/', 1) <> author_id::text`)).toBe(0);
  });

  it("has 10 upcoming published events with RSVPs", async () => {
    expect(await count(`select count(*) from public.events where status = 'published' and starts_at > now()`)).toBe(10);
    expect(await count(`select count(*) from public.event_rsvps`)).toBeGreaterThan(10);
  });

  it("has 16 listings from approved businesses that are all labelled (Demo)", async () => {
    expect(await count(`select count(*) from public.listings`)).toBe(16);
    expect(await count(`select count(*) from public.businesses where status = 'approved'`)).toBe(5);
    expect(await count(`select count(*) from public.listings l join public.businesses b on b.id = l.business_id where b.name not like '%(Demo)'`)).toBe(0);
    const categories = await db.query<{ category: string }>(`select distinct category::text as category from public.listings order by 1`);
    expect(categories.rows.map((r) => r.category)).toEqual(expect.arrayContaining(["hotel", "resort", "villa", "yacht", "supercar", "experience"]));
  });

  it("uses the aviation category when the enum provides it", async () => {
    const hasAviation = await count(`select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'listing_category' and e.enumlabel = 'aviation'`);
    const aviation = await count(`select count(*) from public.listings where category::text = 'aviation'`);
    expect(aviation).toBe(hasAviation ? 3 : 0);
  });

  it("has 10 communities with members, threads and replies when the communities migration exists", async () => {
    const exists = await count(`select count(*) from pg_class where oid = to_regclass('public.communities')`);
    if (!exists) return;
    expect(await count(`select count(*) from public.communities where name like '%(Demo)'`)).toBe(10);
    expect(await count(`select count(*) from public.community_members where status = 'active'`)).toBeGreaterThan(50);
    expect(await count(`select count(*) from public.community_threads`)).toBe(20);
    expect(await count(`select count(*) from public.community_replies`)).toBe(40);
    expect(await count(`select count(*) from public.communities c where c.member_count <> (select count(*) from public.community_members m where m.community_id = c.id and m.status = 'active')`)).toBe(0);
  });
});

const ME = "00000031-5eed-4000-8000-000000000031";

describe("demo feature showcase (demo_features.sql)", () => {
  it("has a complete, verified admin showcase account with every paid plan", async () => {
    const { rows } = await db.query<{ handle: string; verified: string[]; role: string; bio: string }>(
      `select p.handle, p.verified_kinds::text[] as verified, s.role::text as role, p.bio
       from public.profiles p join public.staff_roles s on s.user_id = p.id where p.id = $1`,
      [ME],
    );
    expect(rows[0]).toMatchObject({ handle: "instastrategix_demo", verified: ["identity"], role: "admin" });
    expect(rows[0]!.bio.startsWith("Demo profile —")).toBe(true);
    expect(await count(`select count(*) from auth.users where id = '${ME}' and email = 'instastrategix@seed.elvora.test'`)).toBe(1);
    expect(
      await count(`select count(*) from public.membership_plans p where p.active and not p.is_free
        and not exists (select 1 from public.plan_grants g where g.user_id = '${ME}' and g.plan_id = p.id and g.expires_at > now())`),
    ).toBe(0);
    expect(await count(`select count(*) from public.profile_experiences where profile_id = '${ME}'`)).toBe(2);
    expect(await count(`select count(*) from public.profile_links where profile_id = '${ME}'`)).toBe(2);
    expect(await count(`select cardinality(achievements) from public.profiles where id = '${ME}'`)).toBe(3);
  });

  it("has an approved business with nothing required missing, and a published listing", async () => {
    expect(
      await count(`select count(*) from public.businesses where owner_id = '${ME}' and status = 'approved'
        and name like '%(Demo)' and char_length(description) >= 80 and location is not null and contact_email is not null
        and registration_number is not null and cardinality(evidence_paths) > 0 and website is not null`),
    ).toBe(1);
    expect(
      await count(`select count(*) from public.listings l join public.businesses b on b.id = l.business_id
        where b.owner_id = '${ME}' and l.status = 'published'`),
    ).toBe(1);
  });

  it("serves the approved demo campaign and keeps the second one in the review queue", async () => {
    expect(await count(`select count(*) from public.ad_campaigns c join public.advertiser_accounts a on a.id = c.advertiser_account_id where a.owner_id = '${ME}' and c.status = 'active'`)).toBe(1);
    expect(await count(`select count(*) from public.ad_campaigns c join public.advertiser_accounts a on a.id = c.advertiser_account_id where a.owner_id = '${ME}' and c.status = 'pending_review'`)).toBe(1);
    expect(await count(`select count(*) from public.ad_audiences au join public.advertiser_accounts a on a.id = au.account_id where a.owner_id = '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.ad_billing_settings where currency in ('INR', 'USD')`)).toBe(2);
    // The seed delivered real impressions (and a few clicks) through the engine and paid for them.
    expect(await count(`select count(*) from public.ad_events e join public.advertiser_accounts a on a.id = e.account_id where a.owner_id = '${ME}' and e.event_type = 'impression'`)).toBeGreaterThan(0);
    expect(await count(`select count(*) from public.ad_events e join public.advertiser_accounts a on a.id = e.account_id where a.owner_id = '${ME}' and e.event_type = 'click'`)).toBeGreaterThan(0);
    expect(await count(`select balance_minor from public.advertiser_accounts where owner_id = '${ME}'`)).toBeLessThan(5_000_000);
    expect(await count(`select balance_minor from public.advertiser_accounts where owner_id = '${ME}'`)).toBeGreaterThan(0);

    const served = await asUser(db, "00000027-5eed-4000-8000-000000000027", (tx) =>
      tx.query<{ headline: string | null }>(`select headline from public.serve_ads_v2('discover', 1)`),
    );
    expect(served.rows.map((r) => r.headline)).toContain("Grow your luxury brand (Demo)");
  });

  it("has conversations with a reaction and an unsent message", async () => {
    expect(await count(`select count(*) from public.conversation_participants where user_id = '${ME}'`)).toBe(2);
    expect(await count(`select count(*) from public.messages m join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = '${ME}'`)).toBeGreaterThanOrEqual(5);
    expect(await count(`select count(*) from public.messages where sender_id = '${ME}' and unsent_at is not null`)).toBe(1);
    expect(await count(`select count(*) from public.message_reactions where user_id = '${ME}'`)).toBe(1);
  });

  it("has introductions waiting, forwarded and accepted", async () => {
    const { rows } = await db.query<{ status: string; n: number }>(
      `select status::text as status, count(*)::int as n from public.introduction_requests
       where '${ME}' in (requester_id, introducer_id, target_id) group by 1 order by 1`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.status, r.n]))).toEqual({ accepted: 1, forwarded: 1, pending: 2 });
    // The accepted introduction connected the two members and opened their conversation.
    expect(await count(`select count(*) from public.introduction_requests where status = 'accepted' and conversation_id is not null`)).toBe(1);
  });

  it("has vouches both ways and open vouch requests", async () => {
    expect(await count(`select count(*) from public.vouches where vouchee_id = '${ME}' and withdrawn_at is null`)).toBe(2);
    expect(await count(`select count(*) from public.vouches where voucher_id = '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.vouch_requests where '${ME}' in (requester_id, voucher_id) and status = 'pending'`)).toBe(2);
  });

  it("has an NDA deal room with a joined member, an invitee and discussion", async () => {
    expect(await count(`select count(*) from public.deal_rooms where owner_id = '${ME}' and nda_required`)).toBe(1);
    expect(await count(`select count(*) from public.deal_room_members m join public.deal_rooms r on r.id = m.room_id where r.owner_id = '${ME}' and m.nda_accepted_at is not null and m.user_id <> '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.deal_room_members m join public.deal_rooms r on r.id = m.room_id where r.owner_id = '${ME}' and m.joined_at is null`)).toBe(1);
    expect(await count(`select count(*) from public.deal_room_messages m join public.deal_rooms r on r.id = m.room_id where r.owner_id = '${ME}'`)).toBe(2);
  });

  it("has private contact notes, a reminder due today, and the rest of the showcase", async () => {
    expect(await count(`select count(*) from public.contact_notes where owner_id = '${ME}'`)).toBe(3);
    expect(await count(`select count(*) from public.contact_reminders where owner_id = '${ME}' and due_on <= current_date and done_at is null`)).toBe(1);
    expect(await count(`select count(*) from public.post_poll_votes v join public.posts p on p.id = v.post_id where p.author_id = '${ME}'`)).toBe(7);
    expect(await count(`select count(*) from public.collection_items i join public.collections c on c.id = i.collection_id where c.owner_id = '${ME}'`)).toBeGreaterThanOrEqual(3);
    expect(await count(`select count(*) from public.opportunities where author_id = '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.opportunity_interests where user_id = '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.invitations where created_by = '${ME}'`)).toBe(1);
    expect(await count(`select count(*) from public.community_members where user_id = '${ME}' and status = 'active'`)).toBe(2);
    expect(await count(`select count(*) from public.event_rsvps where user_id = '${ME}'`)).toBe(2);
    const { rows } = await db.query<{ type: string }>(`select distinct type::text as type from public.notifications where user_id = '${ME}'`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});

describe("demo_features.sql guard", () => {
  it("refuses to run when the database has a non-seed user", async () => {
    const fresh = await createMigratedDb();
    try {
      await fresh.exec(SEED_STUBS);
      await fresh.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'real.person@example.com')`);
      await expect(fresh.exec(readFileSync(path.join(SUPABASE_DIR, "seeds", "demo_features.sql"), "utf8"))).rejects.toThrow(
        /demo seed refused/,
      );
    } finally {
      await fresh.close();
    }
  }, 120_000);
});
