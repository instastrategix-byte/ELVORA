import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const ANA = "00000000-0000-4000-8000-0000000001a1"; // requester
const BEN = "00000000-0000-4000-8000-0000000001a2"; // introducer (connected to ANA and CAL)
const CAL = "00000000-0000-4000-8000-0000000001a3"; // target
const DEE = "00000000-0000-4000-8000-0000000001a4"; // stranger
const PRIV = "00000000-0000-4000-8000-0000000001a5"; // connections-only profile

let db: PGlite;

async function connect(a: string, b: string) {
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [a, b]);
}

const rpc = <T = unknown>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [ANA, "ana_req"],
    [BEN, "ben_intro"],
    [CAL, "cal_target"],
    [DEE, "dee_stranger"],
    [PRIV, "priv_person"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`update public.profiles set profile_visibility = 'connections' where id = $1`, [PRIV]);
  await connect(ANA, BEN);
  await connect(BEN, CAL);
});

describe("profile views", () => {
  it("records at most one view per viewer per day, never your own, and only for visible profiles", async () => {
    await rpc(ANA, `select public.record_profile_view($1)`, [CAL]);
    await rpc(ANA, `select public.record_profile_view($1)`, [CAL]);
    await rpc(CAL, `select public.record_profile_view($1)`, [CAL]);
    await rpc(DEE, `select public.record_profile_view($1)`, [PRIV]); // can't see it → not counted
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.profile_views where profile_id = $1`, [CAL]);
    expect(rows.rows[0]!.n).toBe(1);
    const priv = await db.query<{ n: number }>(`select count(*)::int as n from public.profile_views where profile_id = $1`, [PRIV]);
    expect(priv.rows[0]!.n).toBe(0);
  });

  it("owners get daily aggregates only; nobody can read who viewed", async () => {
    const stats = await rpc<{ day: string; views: number }>(CAL, `select * from public.profile_view_stats(7)`);
    expect(stats).toHaveLength(7);
    expect(stats.reduce((s, r) => s + r.views, 0)).toBe(1);
    await expect(rpc(CAL, `select viewer_id from public.profile_views`)).rejects.toThrow(/permission denied/);
    await expect(rpc(null, `select * from public.profile_view_stats(7)`)).rejects.toThrow(/permission denied/);
  });
});

describe("introduction requests", () => {
  let introId: string;

  it("only allows asking your own connection about one of theirs", async () => {
    await expect(rpc(DEE, `select public.request_introduction($1, $2, $3)`, [BEN, CAL, "I'd love an introduction to discuss yachting."])).rejects.toThrow(
      /own connections/,
    );
    await expect(rpc(ANA, `select public.request_introduction($1, $2, $3)`, [BEN, DEE, "I'd love an introduction to discuss yachting."])).rejects.toThrow(
      /not connected/,
    );
    const r = await rpc<{ id: string }>(ANA, `select public.request_introduction($1, $2, $3) as id`, [BEN, CAL, "I'd love an introduction to discuss yachting."]);
    introId = r[0]!.id;
    expect(introId).toBeTruthy();
  });

  it("hides the request from the target until the introducer forwards it", async () => {
    expect(await rpc(CAL, `select id from public.introduction_requests`)).toHaveLength(0);
    expect(await rpc(DEE, `select id from public.introduction_requests`)).toHaveLength(0);
    await expect(rpc(CAL, `select public.respond_introduction_as_target($1, true)`, [introId])).rejects.toThrow(/not found/);
    await expect(rpc(ANA, `select public.respond_introduction_as_introducer($1, true, null)`, [introId])).rejects.toThrow(/not found/);
    await rpc(BEN, `select public.respond_introduction_as_introducer($1, true, 'Ana is great')`, [introId]);
    expect(await rpc(CAL, `select id from public.introduction_requests`)).toHaveLength(1);
  });

  it("connects requester and target when the target accepts, and notifies everyone", async () => {
    await rpc(CAL, `select public.respond_introduction_as_target($1, true)`, [introId]);
    const conn = await db.query(
      `select 1 from public.connections where status = 'accepted' and ((requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1))`,
      [ANA, CAL],
    );
    expect(conn.rows).toHaveLength(1);
    const notes = await db.query<{ user_id: string }>(`select user_id from public.notifications where type = 'introduction' and entity_id = $1`, [introId]);
    expect(new Set(notes.rows.map((n) => n.user_id))).toEqual(new Set([BEN, CAL, ANA]));
  });

  it("blocks direct writes: every change goes through the checked functions", async () => {
    await expect(
      rpc(ANA, `insert into public.introduction_requests (requester_id, introducer_id, target_id, message) values ($1, $2, $3, $4)`, [
        ANA,
        BEN,
        DEE,
        "x".repeat(30),
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(rpc(ANA, `update public.introduction_requests set status = 'accepted' where id = $1`, [introId])).rejects.toThrow(/permission denied/);
  });

  it("lists introduction paths only through the caller's own connections", async () => {
    const paths = await rpc<{ p: string }>(DEE, `select public.introduction_paths($1) as p`, [CAL]);
    expect(paths).toHaveLength(0);
    // ANA ↔ BEN ↔ CAL; ANA is now connected to CAL directly, but BEN is still a path.
    const anaPaths = await rpc<{ p: string }>(ANA, `select public.introduction_paths($1) as p`, [CAL]);
    expect(anaPaths.map((r) => r.p)).toEqual([BEN]);
  });
});
