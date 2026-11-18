import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const AUTHOR = "00000000-0000-4000-8000-0000000006a1";
const FRIEND = "00000000-0000-4000-8000-0000000006a2"; // connected to AUTHOR
const OTHER = "00000000-0000-4000-8000-0000000006a3"; // member, not connected
const BLOCKER = "00000000-0000-4000-8000-0000000006a4"; // has blocked AUTHOR
const FRESH = "00000000-0000-4000-8000-0000000006a5"; // not onboarded

let db: PGlite;

async function post(authorId: string, body: string, visibility = "members"): Promise<string> {
  return asUser(db, authorId, async (tx) => {
    const r = await tx.query<{ id: string }>(`insert into public.posts (author_id, body, visibility) values ($1, $2, $3) returning id`, [
      authorId,
      body,
      visibility,
    ]);
    return r.rows[0]!.id;
  });
}

async function repost(userId: string, postId: string) {
  return asUser(db, userId, (tx) => tx.query(`insert into public.post_reposts (user_id, post_id) values ($1, $2)`, [userId, postId]));
}

async function notificationsOf(userId: string, type: string): Promise<{ actor_id: string; entity_id: string }[]> {
  const r = await db.query<{ actor_id: string; entity_id: string }>(
    `select actor_id, entity_id from public.notifications where user_id = $1 and type::text = $2`,
    [userId, type],
  );
  return r.rows;
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [AUTHOR, "author"],
    [FRIEND, "friend"],
    [OTHER, "other"],
    [BLOCKER, "blocker"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "fresh", onboarded: false });
  await db.query(`insert into public.connections (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [AUTHOR, FRIEND]);
  await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [BLOCKER, AUTHOR]);
}, 120_000);

describe("reposts", () => {
  it("members can repost visible posts; the count is maintained by the database", async () => {
    const id = await post(AUTHOR, "Opening our Lisbon office");
    await repost(FRIEND, id);
    await repost(OTHER, id);
    const r = await db.query<{ repost_count: number }>(`select repost_count from public.posts where id = $1`, [id]);
    expect(r.rows[0]!.repost_count).toBe(2);
    expect(await notificationsOf(AUTHOR, "post_reposted")).toHaveLength(2);

    await asUser(db, OTHER, (tx) => tx.query(`delete from public.post_reposts where user_id = $1 and post_id = $2`, [OTHER, id]));
    const after = await db.query<{ repost_count: number }>(`select repost_count from public.posts where id = $1`, [id]);
    expect(after.rows[0]!.repost_count).toBe(1);
  });

  it("connections-only posts cannot be reposted, even by a connection", async () => {
    const id = await post(AUTHOR, "Private note to my network", "connections");
    await expect(repost(FRIEND, id)).rejects.toThrow(/row-level security/);
  });

  it("members cannot repost their own posts or repost for someone else", async () => {
    const id = await post(AUTHOR, "My own post");
    await expect(repost(AUTHOR, id)).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, OTHER, (tx) => tx.query(`insert into public.post_reposts (user_id, post_id) values ($1, $2)`, [FRIEND, id])),
    ).rejects.toThrow(/row-level security/);
  });

  it("members without posting rights cannot repost, and the counter is not client-writable", async () => {
    const id = await post(AUTHOR, "Another update");
    await expect(repost(FRESH, id)).rejects.toThrow();
    await expect(asUser(db, AUTHOR, (tx) => tx.query(`update public.posts set repost_count = 999 where id = $1`, [id]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("narrowing a post to connections-only removes existing reposts", async () => {
    const id = await post(AUTHOR, "Will become private");
    await repost(OTHER, id);
    await asUser(db, AUTHOR, (tx) => tx.query(`update public.posts set visibility = 'connections' where id = $1`, [id]));
    const r = await db.query<{ n: number; c: number }>(
      `select (select count(*)::int from public.post_reposts where post_id = $1) as n, repost_count as c from public.posts where id = $1`,
      [id],
    );
    expect(r.rows[0]).toEqual({ n: 0, c: 0 });
  });
});

describe("mentions", () => {
  it("notifies mentioned members who can see the post, once each", async () => {
    const id = await post(AUTHOR, "Thanks @Friend and @other — and @friend again. Write to me@friend.com");
    const friend = await notificationsOf(FRIEND, "mention");
    expect(friend.filter((n) => n.entity_id === id)).toHaveLength(1);
    expect((await notificationsOf(OTHER, "mention")).filter((n) => n.entity_id === id)).toHaveLength(1);
  });

  it("does not notify members who cannot see a connections-only post", async () => {
    const id = await post(AUTHOR, "Connections only, cc @friend @other", "connections");
    expect((await notificationsOf(FRIEND, "mention")).some((n) => n.entity_id === id)).toBe(true);
    expect((await notificationsOf(OTHER, "mention")).some((n) => n.entity_id === id)).toBe(false);
  });

  it("never notifies the author themself or a member who blocked them", async () => {
    const id = await post(AUTHOR, "Note to self @author, hello @blocker");
    expect((await notificationsOf(AUTHOR, "mention")).some((n) => n.entity_id === id)).toBe(false);
    expect((await notificationsOf(BLOCKER, "mention")).some((n) => n.entity_id === id)).toBe(false);
  });

  it("notifies mentions in comments, linking to the post", async () => {
    const id = await post(AUTHOR, "Who is coming to Monaco?");
    await asUser(db, FRIEND, (tx) =>
      tx.query(`insert into public.post_comments (post_id, author_id, body) values ($1, $2, 'Count me in, @other')`, [id, FRIEND]),
    );
    const n = (await notificationsOf(OTHER, "mention")).filter((x) => x.entity_id === id);
    expect(n).toHaveLength(1);
    expect(n[0]!.actor_id).toBe(FRIEND);
  });

  it("the mention helpers are not callable through the API", async () => {
    await expect(asUser(db, OTHER, (tx) => tx.query(`select public.user_can_view_post($1, gen_random_uuid())`, [OTHER]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asUser(db, OTHER, (tx) => tx.query(`select public.notify_mentions('@friend', $1, gen_random_uuid(), 'x')`, [OTHER])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("trending hashtags", () => {
  it("counts tags across shareable posts only and returns aggregates", async () => {
    await post(OTHER, "Arrived in #Monaco for #GrandPrix");
    await post(FRIEND, "#monaco evenings");
    await post(AUTHOR, "Secret #Monaco #Stealth plans", "connections");
    await post(AUTHOR, "#stealth one");
    const rows = await asUser(db, OTHER, async (tx) => (await tx.query<{ tag: string; post_count: number }>(`select * from public.trending_hashtags(7, 10)`)).rows);
    expect(rows.find((r) => r.tag === "monaco")?.post_count).toBe(2);
    // #stealth appears in one shareable post only (the other is connections-only): below the threshold.
    expect(rows.some((r) => r.tag === "stealth")).toBe(false);
    expect(rows.some((r) => r.tag === "grandprix")).toBe(false);
    expect(Object.keys(rows[0]!)).toEqual(["tag", "post_count"]);
  });

  it("is not available to signed-out visitors or members who haven't onboarded", async () => {
    await expect(asUser(db, null, (tx) => tx.query(`select * from public.trending_hashtags()`))).rejects.toThrow(/permission denied/);
    const rows = await asUser(db, FRESH, async (tx) => (await tx.query(`select * from public.trending_hashtags()`)).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("marketplace categories", () => {
  it("accepts private aviation listings", async () => {
    const r = await db.query<{ ok: boolean }>(`select 'aviation'::public.listing_category is not null as ok`);
    expect(r.rows[0]!.ok).toBe(true);
  });
});
