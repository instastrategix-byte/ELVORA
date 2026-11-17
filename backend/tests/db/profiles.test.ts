import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const OWNER = "00000000-0000-4000-8000-0000000000f1";
const OTHER = "00000000-0000-4000-8000-0000000000f2";
const FRIEND = "00000000-0000-4000-8000-0000000000f3";

let db: PGlite;

const addExperience = (tx: PGlite, profileId: string, title = "Founder") =>
  tx.query<{ id: string }>(
    `insert into public.profile_experiences (profile_id, title, company, starts_on) values ($1, $2, 'Maison Lumen', '2019-01-01') returning id`,
    [profileId, title],
  );

beforeAll(async () => {
  db = await createMigratedDb();
  await createUser(db, { id: OWNER, handle: "owner" });
  await createUser(db, { id: OTHER, handle: "other" });
  await createUser(db, { id: FRIEND, handle: "friend" });
  await db.query(`insert into public.connections (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [OWNER, FRIEND]);
}, 60_000);

describe("professional profiles", () => {
  it("members can set their professional fields", async () => {
    const res = await asUser(db, OWNER, (tx) =>
      tx.query<{ member_type: string; open_to: string[] }>(
        `update public.profiles
            set member_type = 'founder', skills = '{Strategy,Fundraising}', open_to = '{investing,advisory}',
                achievements = '{"Forbes 30 Under 30"}', linkedin_url = 'https://linkedin.com/in/owner'
          where id = $1 returning member_type, open_to`,
        [OWNER],
      ),
    );
    expect(res.rows[0]).toEqual({ member_type: "founder", open_to: ["investing", "advisory"] });
  });

  it("open_to rejects values outside the fixed set", async () => {
    await expect(
      asUser(db, OWNER, (tx) => tx.query(`update public.profiles set open_to = '{investing,dating}' where id = $1`, [OWNER])),
    ).rejects.toThrow(/profiles_open_to_check/);
  });

  it("social links must be https", async () => {
    await expect(
      asUser(db, OWNER, (tx) => tx.query(`update public.profiles set x_url = 'http://x.com/owner' where id = $1`, [OWNER])),
    ).rejects.toThrow(/profiles_x_url_check/);
  });

  it("trusted columns are still not writable", async () => {
    for (const column of ["account_status = 'active'", "verified_kinds = '{executive}'", "onboarding_completed_at = now()"]) {
      await expect(
        asUser(db, OWNER, (tx) => tx.query(`update public.profiles set ${column} where id = $1`, [OWNER])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("owners can add, edit and delete their own experience", async () => {
    const inserted = await asUser(db, OWNER, (tx) => addExperience(tx, OWNER, "Temporary"));
    const id = inserted.rows[0]!.id;
    const updated = await asUser(db, OWNER, (tx) =>
      tx.query(`update public.profile_experiences set title = 'Chair' where id = $1 returning id`, [id]),
    );
    expect(updated.rows).toHaveLength(1);
    const deleted = await asUser(db, OWNER, (tx) => tx.query(`delete from public.profile_experiences where id = $1 returning id`, [id]));
    expect(deleted.rows).toHaveLength(1);
  });

  it("members cannot add, edit or delete experience on someone else's profile", async () => {
    await expect(asUser(db, OTHER, (tx) => addExperience(tx, OWNER))).rejects.toThrow(/row-level security/);
    const { rows } = await asUser(db, OWNER, (tx) => addExperience(tx, OWNER, "CEO"));
    const id = rows[0]!.id;
    const edited = await asUser(db, OTHER, (tx) =>
      tx.query(`update public.profile_experiences set title = 'Hacked' where id = $1 returning id`, [id]),
    );
    expect(edited.rows).toHaveLength(0);
    const removed = await asUser(db, OTHER, (tx) => tx.query(`delete from public.profile_experiences where id = $1 returning id`, [id]));
    expect(removed.rows).toHaveLength(0);
  });

  it("experience follows the profile's visibility", async () => {
    const visibleTo = (userId: string | null) =>
      asUser(db, userId, (tx) =>
        tx.query(`select id from public.profile_experiences where profile_id = $1`, [OWNER]).then((r) => r.rows.length),
      );
    expect(await visibleTo(OTHER)).toBeGreaterThan(0);

    await asUser(db, OWNER, (tx) => tx.query(`update public.profiles set profile_visibility = 'connections' where id = $1`, [OWNER]));
    expect(await visibleTo(OTHER)).toBe(0);
    expect(await visibleTo(null)).toBe(0);
    expect(await visibleTo(FRIEND)).toBeGreaterThan(0);
    expect(await visibleTo(OWNER)).toBeGreaterThan(0);
  });

  it("caps a profile at 20 experiences", async () => {
    const existing = await db.query<{ n: number }>(`select count(*)::int as n from public.profile_experiences where profile_id = $1`, [OWNER]);
    for (let i = existing.rows[0]!.n; i < 20; i++) await asUser(db, OWNER, (tx) => addExperience(tx, OWNER, `Role ${i}`));
    await expect(asUser(db, OWNER, (tx) => addExperience(tx, OWNER, "One too many"))).rejects.toThrow(/at most 20/);
  });
});
