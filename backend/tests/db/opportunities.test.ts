import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const POSTER = "00000000-0000-4000-8000-0000000006b1";
const FRIEND = "00000000-0000-4000-8000-0000000006b2"; // connected to POSTER
const OTHER = "00000000-0000-4000-8000-0000000006b3"; // member, not connected
const FRESH = "00000000-0000-4000-8000-0000000006b4"; // not onboarded
const CAPPED = "00000000-0000-4000-8000-0000000006b5";

let db: PGlite;

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

async function post(user: string, opts: { visibility?: string; kind?: string; title?: string } = {}): Promise<string> {
  const rows = await q<{ id: string }>(
    user,
    `insert into public.opportunities (author_id, kind, title, visibility) values ($1, $2, $3, $4) returning id`,
    [user, opts.kind ?? "partnership", opts.title ?? "Seeking a distribution partner", opts.visibility ?? "members"],
  );
  return rows[0]!.id;
}

const visibleIds = async (user: string | null) => (await q<{ id: string }>(user, `select id from public.opportunities`)).map((r) => r.id);

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [POSTER, "poster"],
    [FRIEND, "friend"],
    [OTHER, "other_member"],
    [CAPPED, "capped"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "fresh_opp", onboarded: false });
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [POSTER, FRIEND]);
});

describe("opportunities", () => {
  let membersOpp: string;
  let connectionsOpp: string;

  it("lets onboarded members post, but not members who haven't finished onboarding", async () => {
    membersOpp = await post(POSTER);
    connectionsOpp = await post(POSTER, { visibility: "connections", title: "Board seat for a fintech" });
    await expect(post(FRESH)).rejects.toThrow(/row-level security/);
  });

  it("shows nothing to signed-out visitors", async () => {
    await expect(visibleIds(null)).rejects.toThrow(/permission denied/);
  });

  it("hides connections-only opportunities from non-connections", async () => {
    expect(await visibleIds(FRIEND)).toEqual(expect.arrayContaining([membersOpp, connectionsOpp]));
    const other = await visibleIds(OTHER);
    expect(other).toContain(membersOpp);
    expect(other).not.toContain(connectionsOpp);
  });

  it("rejects amounts on kinds that don't take them and non-author edits", async () => {
    await expect(
      q(POSTER, `insert into public.opportunities (author_id, kind, title, amount_min_minor, currency) values ($1, 'hiring', 'Chief of staff role', 100, 'USD')`, [POSTER]),
    ).rejects.toThrow(/check constraint/);
    const rows = await q(OTHER, `update public.opportunities set title = 'Hijacked title' where id = $1 returning id`, [membersOpp]);
    expect(rows).toHaveLength(0);
  });

  it("keeps interest private: poster sees who; others see only their own", async () => {
    await q(FRIEND, `insert into public.opportunity_interests (opportunity_id, user_id, note) values ($1, $2, 'Happy to help')`, [membersOpp, FRIEND]);
    await q(OTHER, `insert into public.opportunity_interests (opportunity_id, user_id) values ($1, $2)`, [membersOpp, OTHER]);
    expect(await q(POSTER, `select user_id from public.opportunity_interests where opportunity_id = $1`, [membersOpp])).toHaveLength(2);
    const otherSees = await q<{ user_id: string }>(OTHER, `select user_id from public.opportunity_interests`);
    expect(otherSees.map((r) => r.user_id)).toEqual([OTHER]);
    const count = await db.query<{ interest_count: number }>(`select interest_count from public.opportunities where id = $1`, [membersOpp]);
    expect(count.rows[0]!.interest_count).toBe(2);
    const notes = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'opportunity'`, [POSTER]);
    expect(notes.rows.length).toBe(2);
  });

  it("rejects interest in your own opportunity, on someone else's behalf, or in hidden ones", async () => {
    await expect(q(POSTER, `insert into public.opportunity_interests (opportunity_id, user_id) values ($1, $2)`, [membersOpp, POSTER])).rejects.toThrow(
      /row-level security/,
    );
    await expect(q(OTHER, `insert into public.opportunity_interests (opportunity_id, user_id) values ($1, $2)`, [connectionsOpp, OTHER])).rejects.toThrow(
      /row-level security/,
    );
    await expect(q(OTHER, `insert into public.opportunity_interests (opportunity_id, user_id) values ($1, $2)`, [connectionsOpp, FRIEND])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("doesn't let clients write counters or forge interest status", async () => {
    await expect(q(POSTER, `update public.opportunities set interest_count = 99 where id = $1`, [membersOpp])).rejects.toThrow(/permission denied/);
    await expect(
      q(OTHER, `update public.opportunity_interests set status = 'shortlisted' where opportunity_id = $1 and user_id = $2`, [membersOpp, OTHER]),
    ).rejects.toThrow(/withdraw or renew/);
  });

  it("notifies the member when the poster shortlists them, and withdrawing updates the count", async () => {
    await q(POSTER, `update public.opportunity_interests set status = 'shortlisted' where opportunity_id = $1 and user_id = $2`, [membersOpp, FRIEND]);
    const n = await db.query<{ payload: { status: string } }>(`select payload from public.notifications where user_id = $1 and type = 'opportunity'`, [FRIEND]);
    expect(n.rows.map((r) => r.payload.status)).toContain("shortlisted");
    await q(OTHER, `update public.opportunity_interests set status = 'withdrawn' where opportunity_id = $1 and user_id = $2`, [membersOpp, OTHER]);
    const count = await db.query<{ interest_count: number }>(`select interest_count from public.opportunities where id = $1`, [membersOpp]);
    expect(count.rows[0]!.interest_count).toBe(1);
  });

  it("keeps closed opportunities visible only to the poster and members who responded", async () => {
    await q(POSTER, `update public.opportunities set status = 'closed' where id = $1`, [membersOpp]);
    expect(await visibleIds(FRIEND)).toContain(membersOpp);
    const third = "00000000-0000-4000-8000-0000000006b6";
    await createUser(db, { id: third, handle: "late_comer" });
    expect(await visibleIds(third)).not.toContain(membersOpp);
  });

  it("caps live opportunities at 10 per member", async () => {
    for (let i = 0; i < 10; i++) await post(CAPPED, { title: `Opportunity number ${i}` });
    await expect(post(CAPPED, { title: "One too many here" })).rejects.toThrow(/at most 10/);
  });
});
