/**
 * Loads seed.sql + seeds/*.sql on top of every migration (in the order `supabase db reset`
 * uses) and checks the development demo dataset is complete and clearly marked as demo data.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb } from "./pglite";

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
    expect(seedFiles()).toEqual(["seed.sql", path.join("seeds", "demo.sql"), path.join("seeds", "demo_communities.sql")]);
  });

  it("has 30 onboarded professional profiles, all marked as demo", async () => {
    expect(await count(`select count(*) from public.profiles where bio like 'Demo profile —%'`)).toBeGreaterThanOrEqual(30);
    expect(await count(`select count(*) from public.profiles where onboarding_completed_at is null`)).toBe(0);
    expect(await count(`select count(*) from public.profiles where bio not like 'Demo profile —%' or bio is null`)).toBe(0);
    expect(await count(`select count(*) from public.profile_experiences`)).toBeGreaterThanOrEqual(25);
    expect(await count(`select count(*) from auth.users where email not like '%@seed.elvora.test'`)).toBe(0);
  });

  it("has a connected network with 50 posts, likes, comments and mentions", async () => {
    expect(await count(`select count(*) from public.posts`)).toBe(50);
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

  it("has 15 listings from approved businesses that are all labelled (Demo)", async () => {
    expect(await count(`select count(*) from public.listings`)).toBe(15);
    expect(await count(`select count(*) from public.businesses where status = 'approved'`)).toBe(4);
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
