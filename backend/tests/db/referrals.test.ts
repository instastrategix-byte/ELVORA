import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const VERIFIED = "00000000-0000-4000-8000-0000000002b1"; // eligible via verification
const GRANTED = "00000000-0000-4000-8000-0000000002b2"; // eligible via complimentary grant
const PLAIN = "00000000-0000-4000-8000-0000000002b3"; // free member, not eligible
const NEWBIE = "00000000-0000-4000-8000-0000000002b4"; // redeems
const NEWBIE2 = "00000000-0000-4000-8000-0000000002b5";
const ADMIN = "00000000-0000-4000-8000-0000000002b6";

let db: PGlite;

const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

async function invite(user: string, email: string | null = null): Promise<{ id: string; code: string }> {
  const rows = await as<{ id: string; code: string }>(user, `select id, code from public.create_member_invitation($1, 'Great founder')`, [email]);
  return rows[0]!;
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [VERIFIED, "verified_v"],
    [GRANTED, "granted_g"],
    [PLAIN, "plain_p"],
    [NEWBIE, "newbie_n"],
    [NEWBIE2, "newbie_two"],
    [ADMIN, "admin_a"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`update public.profiles set verified_kinds = '{executive}' where id = $1`, [VERIFIED]);
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'admin')`, [ADMIN]);
  await db.query(
    `insert into public.plan_grants (user_id, plan_id, reason, granted_by, starts_at, expires_at)
     values ($1, 'premium', 'Launch partner access', $2, now() - interval '1 day', now() + interval '30 days')`,
    [GRANTED, ADMIN],
  );
});

describe("member referrals", () => {
  it("only lets verified or paying members vouch", async () => {
    await expect(invite(PLAIN)).rejects.toThrow(/verified members and members with an active membership/);
    await expect(as(null, `select * from public.create_member_invitation(null, null)`)).rejects.toThrow(/permission denied/);
    const v = await invite(VERIFIED);
    expect(v.code).toMatch(/^ELV-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const g = await invite(GRANTED);
    expect(g.code).not.toBe(v.code);
  });

  it("codes are valid, single-use, reviewed, and notify the inviter when used", async () => {
    const { id, code } = await invite(VERIFIED);
    const check = await as<{ valid: boolean; pre_approved: boolean }>(null, `select * from public.check_invitation($1)`, [code]);
    expect(check[0]).toMatchObject({ valid: true, pre_approved: false });

    const app = await as<{ id: string }>(NEWBIE, `select public.redeem_invitation($1, 'Introduced by a friend') as id`, [code]);
    const status = await db.query<{ status: string }>(`select status from public.membership_applications where id = $1`, [app[0]!.id]);
    expect(status.rows[0]!.status).toBe("submitted"); // still goes through review

    await expect(as(NEWBIE2, `select public.redeem_invitation($1, null)`, [code])).rejects.toThrow(/invalid or expired/);

    const notes = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'referral_joined' and entity_id = $2`, [VERIFIED, id]);
    expect(notes.rows).toHaveLength(1);

    const mine = await as<{ id: string; status: string; redeemed_by: string }>(VERIFIED, `select * from public.list_member_invitations()`);
    expect(mine.find((r) => r.id === id)).toMatchObject({ status: "joined", redeemed_by: NEWBIE });
  });

  it("members see only their own invitations, and never the code hash", async () => {
    const theirs = await as<{ id: string }>(GRANTED, `select id from public.list_member_invitations()`);
    const mine = await as<{ id: string }>(VERIFIED, `select id from public.list_member_invitations()`);
    expect(theirs.some((t) => mine.some((m) => m.id === t.id))).toBe(false);
    expect(await as(VERIFIED, `select id from public.invitations`)).toHaveLength(0); // no direct table access for members
  });

  it("revoked and expired invitations can't be redeemed; used ones can't be revoked", async () => {
    const r = await invite(GRANTED);
    await as(GRANTED, `select public.revoke_member_invitation($1)`, [r.id]);
    await expect(as(NEWBIE2, `select public.redeem_invitation($1, null)`, [r.code])).rejects.toThrow(/invalid or expired/);
    await expect(as(VERIFIED, `select public.revoke_member_invitation($1)`, [r.id])).rejects.toThrow(/not found/);

    const e = await invite(GRANTED);
    await db.query(`update public.invitations set expires_at = now() - interval '1 minute' where id = $1`, [e.id]);
    await expect(as(NEWBIE2, `select public.redeem_invitation($1, null)`, [e.code])).rejects.toThrow(/invalid or expired/);
    const status = await as<{ id: string; status: string }>(GRANTED, `select id, status from public.list_member_invitations()`);
    expect(status.find((s) => s.id === e.id)?.status).toBe("expired");
  });

  it("caps open invitations at 5 per member", async () => {
    // GRANTED has 1 open so far (one revoked, one expired).
    for (let i = 0; i < 4; i++) await invite(GRANTED);
    await expect(invite(GRANTED)).rejects.toThrow(/up to 5 open invitations/);
  });

  it("caps invitations at 20 per rolling 30 days", async () => {
    await db.query(
      `insert into public.invitations (code_hash, plan_id, created_by, is_referral, revoked_at, created_at)
       select md5(random()::text || g), 'premium', $1, true, now(), now() - interval '1 day' from generate_series(1, 20) g`,
      [VERIFIED],
    );
    await expect(invite(VERIFIED)).rejects.toThrow(/limit of 20 invitations/);
  });
});
