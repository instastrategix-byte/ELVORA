/**
 * Permanent regression guard for database security. It introspects the fully migrated schema,
 * so a future migration that forgets RLS, a pinned search_path, or a revoke fails CI here.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

/**
 * SECURITY DEFINER functions signed-out callers may execute. Most are used inside RLS policies
 * that anon evaluates (functions in policies run with the caller's privileges); each one checks
 * the caller itself. Adding to this list needs a reason.
 */
const ANON_DEFINER_ALLOWLIST = new Set([
  "are_connected(uuid,uuid)",
  "can_message(uuid)",
  "can_read_member_state(uuid)",
  "can_view_listing(uuid,listing_status,listing_visibility)",
  "can_view_post(uuid,visibility,content_status)",
  "can_view_profile(uuid,visibility,account_status,boolean)",
  "can_view_profile_link(uuid,visibility)",
  "check_invitation(text)", // invitation codes are checked before sign-up
  "has_active_subscription(uuid)",
  "has_feature(text,uuid)",
  "is_active_member(uuid)",
  "is_blocked_between(uuid,uuid)",
  "is_business_approved(uuid)",
  "is_business_owner(uuid)",
  "is_conversation_participant(uuid,uuid)",
  "is_eligible_for_plan(text,uuid)",
  "is_staff(staff_role)",
  "poll_results(uuid[])", // public posts can carry polls
  "realtime_topic_allowed(text)",
  "user_features(uuid)",
]);

/** Buckets whose objects are intentionally served by public URL. */
const PUBLIC_BUCKETS = new Set(["listing-media", "profile-media"]);

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const MOD = "00000000-0000-4000-8000-0000000000a3";
const BUSINESS = "00000000-0000-4000-8000-0000000000b1";

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDb();
  await createUser(db, { id: OWNER, handle: "owner_one" });
  await createUser(db, { id: OTHER, handle: "other_one" });
  await createUser(db, { id: MOD, handle: "mod_one" });
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'moderator')`, [MOD]);
  await db.query(
    `insert into public.businesses (id, owner_id, name, slug, category, registration_number, evidence_paths, status, review_note, reviewed_by, reviewed_at)
     values ($1, $2, 'Atelier', 'atelier', 'hospitality', 'REG-123', array[$4::text], 'approved', 'checked', $3, now())`,
    [BUSINESS, OWNER, MOD, `${OWNER}/doc.pdf`],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

describe("schema-wide guards", () => {
  it("every public table has row level security enabled", async () => {
    const missing = await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(missing.map((r) => r.relname)).toEqual([]);
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const unpinned = await rows<{ fn: string }>(
      `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(unpinned.map((r) => r.fn)).toEqual([]);
  });

  it("signed-out callers can execute only allow-listed SECURITY DEFINER functions", async () => {
    const callable = await rows<{ fn: string }>(
      `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
         and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(callable.map((r) => r.fn).filter((fn) => !ANON_DEFINER_ALLOWLIST.has(fn))).toEqual([]);
  });

  it("API roles have no TRUNCATE, TRIGGER or REFERENCES privileges on public tables", async () => {
    const extra = await rows<{ t: string }>(
      `select table_name || ':' || grantee || ':' || privilege_type as t from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
         and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')`,
    );
    expect(extra.map((r) => r.t)).toEqual([]);
  });

  it("storage buckets are private unless intentionally public", async () => {
    const open = await rows<{ id: string }>(`select id from storage.buckets where public`);
    expect(open.map((r) => r.id).filter((id) => !PUBLIC_BUCKETS.has(id))).toEqual([]);
  });

  it("no public-schema views bypass RLS (views must be security_invoker)", async () => {
    const views = await rows<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and not coalesce('security_invoker=true' = any (c.reloptions), false)`,
    );
    expect(views.map((r) => r.relname)).toEqual([]);
  });
});

describe("business verification details", () => {
  const PRIVATE = ["registration_number", "evidence_paths", "review_note", "reviewed_by", "reviewed_at"];

  it("are not readable as columns by API roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const col of PRIVATE) {
        const [r] = await rows<{ ok: boolean }>(`select has_column_privilege($1, 'public.businesses', $2, 'select') as ok`, [role, col]);
        expect(r?.ok, `${role} can read businesses.${col}`).toBe(false);
      }
    }
    const [r] = await rows<{ ok: boolean }>(`select has_column_privilege('anon', 'public.listings', 'reviewed_by', 'select') as ok`);
    expect(r?.ok).toBe(false);
  });

  it("public columns stay readable; private ones are refused outright", async () => {
    const found = await asUser(db, OTHER, (tx) => tx.query<{ name: string }>(`select name from public.businesses where id = $1`, [BUSINESS]));
    expect(found.rows).toEqual([{ name: "Atelier" }]);
    await expect(asUser(db, null, (tx) => tx.query(`select registration_number from public.businesses`))).rejects.toThrow(/permission denied/);
  });

  it("are returned to the owner and moderators only", async () => {
    const call = (user: string) =>
      asUser(db, user, (tx) => tx.query<{ registration_number: string }>(`select * from public.business_private_details(array[$1]::uuid[])`, [BUSINESS]));
    expect((await call(OWNER)).rows[0]?.registration_number).toBe("REG-123");
    expect((await call(MOD)).rows[0]?.registration_number).toBe("REG-123");
    expect((await call(OTHER)).rows).toEqual([]);
    await expect(asUser(db, null, (tx) => tx.query(`select * from public.business_private_details(array[$1]::uuid[])`, [BUSINESS]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("owners can still update their business and read it back", async () => {
    const res = await asUser(db, OWNER, (tx) =>
      tx.query<{ id: string }>(`update public.businesses set registration_number = 'REG-456' where id = $1 returning id, name`, [BUSINESS]),
    );
    expect(res.rows).toHaveLength(1);
  });
});

describe("post_reposts privileges", () => {
  it("members cannot truncate or update reposts", async () => {
    await expect(asUser(db, OTHER, (tx) => tx.query(`truncate public.post_reposts`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, OTHER, (tx) => tx.query(`update public.post_reposts set created_at = now()`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query(`select 1 from public.post_reposts`))).rejects.toThrow(/permission denied/);
  });
});

describe("staff-only plan grants", () => {
  it("cannot be called by signed-out visitors and still refuse non-admin members", async () => {
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.grant_plan($1, 'founder', 30, 'test grant')`, [OTHER])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, OTHER, (tx) => tx.query(`select public.grant_plan($1, 'founder', 30, 'test grant')`, [OTHER])),
    ).rejects.toThrow(/forbidden/);
  });
});
