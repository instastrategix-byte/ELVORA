import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const id = (n: number) => `00000000-0000-4000-8000-0000000002${n.toString().padStart(2, "0")}`;

// Vouching
const ANA = id(1); // voucher
const BEN = id(2); // ANA's connection
const CAL = id(3); // not connected to ANA
const DEE = id(4); // unrelated member (viewer)
const SUS = id(5); // suspended, connected to ANA
const STAFF = id(6);
const CAP = id(7); // voucher used for the monthly cap
const FAR = id(8); // applicant, not connected to ANA
// Introductions
const REQ = id(10);
const INT = id(11);
const TGT = id(12);
const TG2 = id(13);
const TG3 = id(14);
const TG4 = id(15);
const CAP_FRIENDS = Array.from({ length: 11 }, (_, i) => id(30 + i));

let db: PGlite;

const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

async function connect(a: string, b: string) {
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [a, b]);
}

async function isConnected(a: string, b: string) {
  const r = await db.query(
    `select 1 from public.connections where status = 'accepted' and ((requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1))`,
    [a, b],
  );
  return r.rows.length > 0;
}

beforeAll(async () => {
  db = await createMigratedDb();
  const users: [string, string][] = [
    [ANA, "ana_v"],
    [BEN, "ben_v"],
    [CAL, "cal_v"],
    [DEE, "dee_v"],
    [SUS, "sus_v"],
    [STAFF, "staff_v"],
    [CAP, "cap_v"],
    [FAR, "far_v"],
    [REQ, "req_i"],
    [INT, "int_i"],
    [TGT, "tgt_i"],
    [TG2, "tg2_i"],
    [TG3, "tg3_i"],
    [TG4, "tg4_i"],
    ...CAP_FRIENDS.map((u, i) => [u, `capf_${i}`] as [string, string]),
  ];
  for (const [uid, handle] of users) await createUser(db, { id: uid, handle });
  await connect(ANA, BEN);
  await connect(ANA, SUS);
  await connect(ANA, DEE);
  for (const f of CAP_FRIENDS) await connect(CAP, f);
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'moderator')`, [STAFF]);

  await connect(REQ, INT);
  for (const t of [TGT, TG2, TG3, TG4]) await connect(INT, t);
  // TGT keeps a connections-only link: "contact details" only shared once connected.
  await db.query(
    `insert into public.profile_links (profile_id, platform, url, visibility) values ($1, 'website', 'https://tgt.example', 'connections')`,
    [TGT],
  );
}, 120_000);

describe("vouching", () => {
  let vouchId: string;

  it("only lets members vouch for their connections, once, and never for themselves", async () => {
    await expect(as(ANA, `select public.vouch_for($1, 'worked_together', null)`, [ANA])).rejects.toThrow(/connections|yourself/);
    await expect(as(ANA, `select public.vouch_for($1, 'worked_together', null)`, [CAL])).rejects.toThrow(/only vouch for your connections/);
    const r = await as<{ id: string }>(ANA, `select public.vouch_for($1, 'worked_together', 'Led our Series A diligence') as id`, [BEN]);
    vouchId = r[0]!.id;
    await expect(as(ANA, `select public.vouch_for($1, 'personal', null)`, [BEN])).rejects.toThrow(/already vouch/);
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'vouch_received' and actor_id = $2`, [BEN, ANA]);
    expect(n.rows).toHaveLength(1);
  });

  it("rejects notes over 280 characters", async () => {
    await expect(as(ANA, `select public.vouch_for($1, 'client', $2)`, [DEE, "x".repeat(281)])).rejects.toThrow(/check/);
  });

  it("stops suspended accounts from vouching", async () => {
    await db.query(`update public.profiles set account_status = 'suspended' where id = $1`, [SUS]);
    await expect(as(SUS, `select public.vouch_for($1, 'personal', null)`, [ANA])).rejects.toThrow(/can't vouch/);
    await db.query(`update public.profiles set account_status = 'active' where id = $1`, [SUS]);
  });

  it("caps vouches at 10 per calendar month, counting withdrawn ones", async () => {
    for (const f of CAP_FRIENDS.slice(0, 10)) await as(CAP, `select public.vouch_for($1, 'personal', null)`, [f]);
    const first = await as<{ id: string }>(CAP, `select id from public.vouches where voucher_id = $1 limit 1`, [CAP]);
    await as(CAP, `select public.withdraw_vouch($1)`, [first[0]!.id]);
    await expect(as(CAP, `select public.vouch_for($1, 'personal', null)`, [CAP_FRIENDS[10]])).rejects.toThrow(/10 members a month/);
    const allowance = await as<{ used: number; cap: number }>(CAP, `select * from public.my_vouch_allowance()`);
    expect(allowance[0]).toEqual({ used: 10, cap: 10 });
    // Last month's vouches don't count.
    await db.query(`update public.vouches set created_at = now() - interval '40 days' where voucher_id = $1`, [CAP]);
    await as(CAP, `select public.vouch_for($1, 'personal', null)`, [CAP_FRIENDS[10]]);
  });

  it("shows vouches to members who can see both profiles, honouring hides and blocks", async () => {
    const seen = await as(DEE, `select id from public.vouches where id = $1`, [vouchId]);
    expect(seen).toHaveLength(1);
    await expect(as(DEE, `select hidden_by_vouchee from public.vouches where id = $1`, [vouchId])).rejects.toThrow(/permission denied/);
    await expect(as(null, `select id from public.vouches`)).rejects.toThrow(/permission denied/);

    // Only the vouchee can hide it.
    await expect(as(ANA, `select public.set_vouch_hidden($1, true)`, [vouchId])).rejects.toThrow(/not found/);
    await as(BEN, `select public.set_vouch_hidden($1, true)`, [vouchId]);
    expect(await as(DEE, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(0);
    expect(await as(ANA, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(1); // voucher isn't told
    const mine = await as<{ id: string; hidden: boolean }>(BEN, `select id, hidden from public.my_received_vouches()`);
    expect(mine).toEqual([{ id: vouchId, hidden: true }]);
    await as(BEN, `select public.set_vouch_hidden($1, false)`, [vouchId]);

    // A block between the viewer and the voucher hides it.
    await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ANA, DEE]);
    expect(await as(DEE, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(0);
    await db.query(`delete from public.user_blocks where blocker_id = $1 and blocked_id = $2`, [ANA, DEE]);

    // A connections-only vouchee profile hides it from non-connections.
    await db.query(`update public.profiles set profile_visibility = 'connections' where id = $1`, [BEN]);
    expect(await as(DEE, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(0);
    await db.query(`update public.profiles set profile_visibility = 'members' where id = $1`, [BEN]);
  });

  it("lets only the voucher withdraw, after which nobody else sees it", async () => {
    await expect(as(BEN, `select public.withdraw_vouch($1)`, [vouchId])).rejects.toThrow(/not found/);
    await as(ANA, `select public.withdraw_vouch($1)`, [vouchId]);
    expect(await as(DEE, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(0);
    expect(await as(BEN, `select id from public.vouches where id = $1`, [vouchId])).toHaveLength(0);
  });

  it("blocks direct writes", async () => {
    await expect(
      as(ANA, `insert into public.vouches (voucher_id, vouchee_id, relationship) values ($1, $2, 'personal')`, [ANA, CAL]),
    ).rejects.toThrow(/permission denied/);
    await expect(as(BEN, `update public.vouches set hidden_by_vouchee = true`)).rejects.toThrow(/permission denied/);
    await expect(
      as(ANA, `insert into public.vouch_requests (requester_id, voucher_id) values ($1, $2)`, [ANA, CAL]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("vouch requests and application referees", () => {
  let appId: string;
  let declinedId: string;

  beforeAll(async () => {
    const plan = await db.query<{ id: string }>(`select id from public.membership_plans where requires_application limit 1`);
    const app = await db.query<{ id: string }>(
      `insert into public.membership_applications (user_id, plan_id, statement) values ($1, $2, 'A statement') returning id`,
      [FAR, plan.rows[0]!.id],
    );
    appId = app.rows[0]!.id;
  });

  it("needs a connection, or an open application of your own", async () => {
    await expect(as(FAR, `select public.request_vouch($1, null, null)`, [ANA])).rejects.toThrow(/only ask your connections/);
    await expect(as(CAL, `select public.request_vouch($1, null, $2)`, [ANA, appId])).rejects.toThrow(/Application not found/);
    const r = await as<{ id: string }>(FAR, `select public.request_vouch($1, 'You know my work at Atlas', $2) as id`, [ANA, appId]);
    declinedId = r[0]!.id;
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'vouch_requested' and entity_id = $2`, [ANA, declinedId]);
    expect(n.rows).toHaveLength(1);
    expect(await as(ANA, `select id from public.vouch_requests where id = $1`, [declinedId])).toHaveLength(1);
  });

  it("declines silently: the requester keeps seeing pending and can't re-ask for 30 days", async () => {
    await as(ANA, `select public.respond_vouch_request($1, false, null, null)`, [declinedId]);
    const sent = await as<{ status: string }>(FAR, `select status from public.my_sent_vouch_requests() where id = $1`, [declinedId]);
    expect(sent[0]!.status).toBe("pending");
    await expect(as(FAR, `select status from public.vouch_requests`)).resolves.toHaveLength(0);
    await expect(as(FAR, `select public.request_vouch($1, null, $2)`, [ANA, appId])).rejects.toThrow(/already asked this member recently/);
    // Cancelling a declined request looks exactly like cancelling a pending one.
    await as(FAR, `select public.cancel_vouch_request($1)`, [declinedId]);
    const after = await as<{ status: string }>(FAR, `select status from public.my_sent_vouch_requests() where id = $1`, [declinedId]);
    expect(after[0]!.status).toBe("cancelled");
    const notes = await db.query(`select 1 from public.notifications where user_id = $1 and type in ('vouch_received', 'vouch_requested')`, [FAR]);
    expect(notes.rows).toHaveLength(0);
  });

  it("shows staff the referees and their real answers", async () => {
    const rows = await as<{ status: string }>(STAFF, `select status from public.vouch_requests where application_id = $1`, [appId]);
    expect(rows.map((r) => r.status)).toEqual(["declined"]);
  });

  it("accepting a request writes the vouch, even without a connection for application referees", async () => {
    const r = await as<{ id: string }>(FAR, `select public.request_vouch($1, null, $2) as id`, [BEN, appId]);
    await expect(as(BEN, `select public.respond_vouch_request($1, true, null, null)`, [r[0]!.id])).rejects.toThrow(/how you know/);
    await as(BEN, `select public.respond_vouch_request($1, true, 'client', 'Great client')`, [r[0]!.id]);
    const v = await db.query(`select 1 from public.vouches where voucher_id = $1 and vouchee_id = $2 and withdrawn_at is null`, [BEN, FAR]);
    expect(v.rows).toHaveLength(1);
    const sent = await as<{ status: string }>(FAR, `select status from public.my_sent_vouch_requests() where id = $1`, [r[0]!.id]);
    expect(sent[0]!.status).toBe("accepted");
    // A request can't be answered twice.
    await expect(as(BEN, `select public.respond_vouch_request($1, true, 'client', null)`, [r[0]!.id])).rejects.toThrow(/not found/);
  });

  it("lapses after 30 days", async () => {
    const r = await as<{ id: string }>(FAR, `select public.request_vouch($1, null, $2) as id`, [DEE, appId]);
    await db.query(`update public.vouch_requests set created_at = now() - interval '31 days' where id = $1`, [r[0]!.id]);
    await expect(as(DEE, `select public.respond_vouch_request($1, true, 'client', null)`, [r[0]!.id])).rejects.toThrow(/not found/);
    const sent = await as<{ status: string }>(FAR, `select status from public.my_sent_vouch_requests() where id = $1`, [r[0]!.id]);
    expect(sent[0]!.status).toBe("expired");
  });
});

describe("double opt-in introductions", () => {
  const MSG = "I'd love to discuss your fund's approach to hospitality.";
  const linkVisible = async (viewer: string) =>
    (await as(viewer, `select url from public.profile_links where profile_id = $1 and visibility = 'connections'`, [TGT])).length > 0;
  const mine = (user: string, introId: string) =>
    as<{ role: string; status: string; introducer_note: string | null; conversation_id: string | null }>(
      user,
      `select role, status, introducer_note, conversation_id from public.my_introductions() where id = $1`,
      [introId],
    );

  it("keeps the requester out of the table and the target out until forwarded", async () => {
    const r = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TGT, MSG]);
    const introId = r[0]!.id;
    expect(await as(REQ, `select id from public.introduction_requests`)).toHaveLength(0);
    expect((await mine(REQ, introId))[0]!.status).toBe("pending");
    expect(await mine(TGT, introId)).toHaveLength(0);
    expect(await as(TGT, `select id from public.introduction_requests where id = $1`, [introId])).toHaveLength(0);
    await expect(as(TGT, `select declined_by from public.introduction_requests`)).rejects.toThrow(/permission denied/);

    await as(INT, `select public.respond_introduction_as_introducer($1, true, 'Two people who should know each other')`, [introId]);
    expect((await mine(TGT, introId))[0]).toMatchObject({ role: "target", status: "forwarded", introducer_note: "Two people who should know each other" });
    // The note is written for the target.
    expect((await mine(REQ, introId))[0]).toMatchObject({ status: "forwarded", introducer_note: null });
    expect(await linkVisible(REQ)).toBe(false);

    // Target declines: silent and anonymous.
    await as(TGT, `select public.respond_introduction_as_target($1, false)`, [introId]);
    expect((await mine(REQ, introId))[0]!.status).toBe("unavailable");
    expect((await mine(INT, introId))[0]!.status).toBe("unavailable");
    expect((await mine(TGT, introId))[0]!.status).toBe("declined");
    const notes = await db.query<{ payload: { status: string } }>(
      `select payload from public.notifications where user_id = $1 and entity_id = $2`,
      [REQ, introId],
    );
    expect(notes.rows.map((n) => n.payload.status)).toEqual(["forwarded"]);
    expect(await isConnected(REQ, TGT)).toBe(false);
    expect(await linkVisible(REQ)).toBe(false);
  });

  it("connects the two, opens a conversation and shares contact details only on mutual accept", async () => {
    const r = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TGT, MSG]);
    const introId = r[0]!.id;
    await expect(as(REQ, `select public.respond_introduction_as_target($1, true)`, [introId])).rejects.toThrow(/not found/);
    await expect(as(TGT, `select public.respond_introduction_as_target($1, true)`, [introId])).rejects.toThrow(/not found/);
    await as(INT, `select public.respond_introduction_as_introducer($1, true, null)`, [introId]);
    expect(await linkVisible(REQ)).toBe(false);
    await as(TGT, `select public.respond_introduction_as_target($1, true)`, [introId]);

    expect(await isConnected(REQ, TGT)).toBe(true);
    expect(await linkVisible(REQ)).toBe(true);
    const req = (await mine(REQ, introId))[0]!;
    const tgt = (await mine(TGT, introId))[0]!;
    expect(req.status).toBe("accepted");
    expect(req.conversation_id).toBeTruthy();
    expect(tgt.conversation_id).toBe(req.conversation_id);
    expect((await mine(INT, introId))[0]!.conversation_id).toBeNull();
    const parts = await db.query<{ user_id: string }>(`select user_id from public.conversation_participants where conversation_id = $1`, [req.conversation_id]);
    expect(new Set(parts.rows.map((p) => p.user_id))).toEqual(new Set([REQ, TGT]));
  });

  it("an introducer's decline reaches the requester as a neutral, actor-less update", async () => {
    const r = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TG2, MSG]);
    const introId = r[0]!.id;
    await as(INT, `select public.respond_introduction_as_introducer($1, false, null)`, [introId]);
    expect((await mine(REQ, introId))[0]!.status).toBe("unavailable");
    expect((await mine(INT, introId))[0]!.status).toBe("declined");
    expect(await mine(TG2, introId)).toHaveLength(0);
    const n = await db.query<{ actor_id: string | null; payload: { status: string } }>(
      `select actor_id, payload from public.notifications where user_id = $1 and entity_id = $2`,
      [REQ, introId],
    );
    expect(n.rows).toEqual([{ actor_id: null, payload: { status: "unavailable" } }]);
  });

  it("expires after 14 days: nobody can act on it, and a new request can be made", async () => {
    const r = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TG3, MSG]);
    const introId = r[0]!.id;
    await db.query(`update public.introduction_requests set expires_at = now() - interval '1 minute' where id = $1`, [introId]);
    await expect(as(INT, `select public.respond_introduction_as_introducer($1, true, null)`, [introId])).rejects.toThrow(/expired/);
    await expect(as(REQ, `select public.withdraw_introduction($1)`, [introId])).rejects.toThrow(/not found/);
    expect((await mine(REQ, introId))[0]!.status).toBe("unavailable");
    expect((await mine(INT, introId))[0]!.status).toBe("expired");
    expect(await mine(TG3, introId)).toHaveLength(0);
    const again = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TG3, MSG]);
    expect(again[0]!.id).not.toBe(introId);
    const old = await db.query<{ status: string }>(`select status from public.introduction_requests where id = $1`, [introId]);
    expect(old.rows[0]!.status).toBe("expired");
  });

  it("an introduction that lapses after forwarding keeps the target's silence private", async () => {
    const r = await as<{ id: string }>(REQ, `select public.request_introduction($1, $2, $3) as id`, [INT, TG4, MSG]);
    const introId = r[0]!.id;
    await as(INT, `select public.respond_introduction_as_introducer($1, true, null)`, [introId]);
    await db.query(`update public.introduction_requests set expires_at = now() - interval '1 minute' where id = $1`, [introId]);
    await expect(as(TG4, `select public.respond_introduction_as_target($1, true)`, [introId])).rejects.toThrow(/expired/);
    expect((await mine(INT, introId))[0]!.status).toBe("unavailable");
    expect((await mine(REQ, introId))[0]!.status).toBe("unavailable");
    expect((await mine(TG4, introId))[0]!.status).toBe("expired");
    expect(await isConnected(REQ, TG4)).toBe(false);
  });
});
