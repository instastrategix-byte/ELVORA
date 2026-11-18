import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const OWNER = "00000000-0000-4000-8000-0000000c0001";
const MOD = "00000000-0000-4000-8000-0000000c0002";
const MEMBER = "00000000-0000-4000-8000-0000000c0003";
const OUTSIDER = "00000000-0000-4000-8000-0000000c0004";
const SEEKER = "00000000-0000-4000-8000-0000000c0005";
const BUILDER = "00000000-0000-4000-8000-0000000c0006";
const FRESH = "00000000-0000-4000-8000-0000000c0007"; // not onboarded

let db: PGlite;
let openId: string;
let privateId: string;
let openThread: string;
let privateThread: string;

async function createCommunity(userId: string, slug: string, visibility = "open"): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.communities (slug, name, visibility, created_by) values ($1, $2, $3, $4) returning id`,
      [slug, `Community ${slug}`, visibility, userId],
    );
    return r.rows[0]!.id;
  });
}

const join = (userId: string, communityId: string) =>
  asUser(db, userId, async (tx) =>
    (
      await tx.query<{ status: string; role: string }>(
        `insert into public.community_members (community_id, user_id) values ($1, $2) returning status, role`,
        [communityId, userId],
      )
    ).rows[0]!,
  );

const startThread = (userId: string, communityId: string, title = "Opening thoughts") =>
  asUser(db, userId, async (tx) =>
    (
      await tx.query<{ id: string }>(
        `insert into public.community_threads (community_id, author_id, title, body) values ($1, $2, $3, 'Hello everyone') returning id`,
        [communityId, userId, title],
      )
    ).rows[0]!.id,
  );

const reply = (userId: string, threadId: string) =>
  asUser(db, userId, (tx) => tx.query(`insert into public.community_replies (thread_id, author_id, body) values ($1, $2, 'Agreed')`, [threadId, userId]));

const visibleThreads = (userId: string | null) =>
  asUser(db, userId, async (tx) => (await tx.query<{ id: string }>(`select id from public.community_threads`)).rows.map((r) => r.id));

const memberCount = async (id: string) =>
  (await db.query<{ member_count: number }>(`select member_count from public.communities where id = $1`, [id])).rows[0]!.member_count;

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [OWNER, "c_owner"],
    [MOD, "c_mod"],
    [MEMBER, "c_member"],
    [OUTSIDER, "c_outsider"],
    [SEEKER, "c_seeker"],
    [BUILDER, "c_builder"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "c_fresh", onboarded: false });

  openId = await createCommunity(OWNER, "founders-circle");
  privateId = await createCommunity(OWNER, "family-office", "private");
}, 60_000);

describe("communities", () => {
  it("signed-out visitors see nothing", async () => {
    await expect(asUser(db, null, (tx) => tx.query(`select id from public.communities`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query(`select id from public.community_threads`))).rejects.toThrow(/permission denied/);
  });

  it("the creator becomes the active owner and the count follows active members", async () => {
    const own = await db.query<{ role: string; status: string }>(
      `select role, status from public.community_members where community_id = $1 and user_id = $2`,
      [openId, OWNER],
    );
    expect(own.rows[0]).toEqual({ role: "owner", status: "active" });
    expect(await memberCount(openId)).toBe(1);
  });

  it("members who aren't onboarded cannot create communities", async () => {
    await expect(createCommunity(FRESH, "not-allowed")).rejects.toThrow(/row-level security/);
  });

  it("open communities: join instantly, post a thread and reply", async () => {
    expect(await join(MEMBER, openId)).toEqual({ status: "active", role: "member" });
    expect(await memberCount(openId)).toBe(2);
    openThread = await startThread(MEMBER, openId);
    await reply(OWNER, openThread);
    const t = await db.query<{ reply_count: number }>(`select reply_count from public.community_threads where id = $1`, [openThread]);
    expect(t.rows[0]!.reply_count).toBe(1);
    // The thread author was notified of the reply.
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'community_reply'`, [MEMBER]);
    expect(n.rows).toHaveLength(1);
  });

  it("non-members can read open communities but cannot post", async () => {
    expect(await visibleThreads(OUTSIDER)).toContain(openThread);
    await expect(startThread(OUTSIDER, openId)).rejects.toThrow(/row-level security/);
    await expect(reply(OUTSIDER, openThread)).rejects.toThrow(/row-level security/);
  });

  it("joining cannot self-assign a role or skip approval", async () => {
    await expect(
      asUser(db, OUTSIDER, (tx) =>
        tx.query(`insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'owner', 'active')`, [privateId, OUTSIDER]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("private threads are hidden from non-members and pending members until approved", async () => {
    privateThread = await startThread(OWNER, privateId, "Allocation notes");
    expect(await visibleThreads(OUTSIDER)).not.toContain(privateThread);

    expect(await join(SEEKER, privateId)).toEqual({ status: "pending", role: "member" });
    expect(await visibleThreads(SEEKER)).not.toContain(privateThread);
    expect(await memberCount(privateId)).toBe(1);
    await expect(startThread(SEEKER, privateId)).rejects.toThrow(/row-level security/);

    // Owners were told about the request.
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'community_request'`, [OWNER]);
    expect(n.rows).toHaveLength(1);
  });

  it("only owners and moderators can approve, and only owners can change roles", async () => {
    // A plain member of the open community has no say in the private one.
    const before = await asUser(db, MEMBER, async (tx) =>
      (await tx.query(`update public.community_members set status = 'active' where community_id = $1 and user_id = $2 returning 1`, [privateId, SEEKER])).rows.length,
    );
    expect(before).toBe(0);

    await asUser(db, OWNER, (tx) =>
      tx.query(`update public.community_members set status = 'active' where community_id = $1 and user_id = $2`, [privateId, SEEKER]),
    );
    expect(await visibleThreads(SEEKER)).toContain(privateThread);
    expect(await memberCount(privateId)).toBe(2);

    // Moderators can't promote others.
    await join(MOD, openId);
    await asUser(db, OWNER, (tx) => tx.query(`update public.community_members set role = 'moderator' where community_id = $1 and user_id = $2`, [openId, MOD]));
    await expect(
      asUser(db, MOD, (tx) => tx.query(`update public.community_members set role = 'moderator' where community_id = $1 and user_id = $2`, [openId, MEMBER])),
    ).rejects.toThrow(/only the owner/);
    // Nobody can touch the owner's row.
    await expect(
      asUser(db, MOD, (tx) => tx.query(`update public.community_members set status = 'banned' where community_id = $1 and user_id = $2`, [openId, OWNER])),
    ).rejects.toThrow(/owner/);
  });

  it("only moderators can lock, and locked threads reject replies", async () => {
    await expect(
      asUser(db, MEMBER, (tx) => tx.query(`update public.community_threads set locked = true where id = $1`, [openThread])),
    ).rejects.toThrow(/only moderators/);
    await asUser(db, MOD, (tx) => tx.query(`update public.community_threads set locked = true, pinned = true where id = $1`, [openThread]));
    await expect(reply(MEMBER, openThread)).rejects.toThrow(/row-level security/);
  });

  it("banned members can't post or rejoin", async () => {
    await asUser(db, MOD, (tx) => tx.query(`update public.community_members set status = 'banned' where community_id = $1 and user_id = $2`, [openId, MEMBER]));
    await expect(startThread(MEMBER, openId)).rejects.toThrow(/row-level security/);
    const left = await asUser(db, MEMBER, async (tx) =>
      (await tx.query(`delete from public.community_members where community_id = $1 and user_id = $2 returning 1`, [openId, MEMBER])).rows.length,
    );
    expect(left).toBe(0);
  });

  it("member_count and reply_count are not client-writable", async () => {
    await expect(
      asUser(db, OWNER, (tx) => tx.query(`update public.communities set member_count = 9999 where id = $1`, [openId])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, OWNER, (tx) => tx.query(`update public.community_threads set reply_count = 50 where id = $1`, [privateThread])),
    ).rejects.toThrow(/permission denied/);
  });

  it("a sixth active community per owner is rejected", async () => {
    for (let i = 1; i <= 5; i += 1) await createCommunity(BUILDER, `builder-${i}`);
    await expect(createCommunity(BUILDER, "builder-6")).rejects.toThrow(/at most 5/);
  });
});
