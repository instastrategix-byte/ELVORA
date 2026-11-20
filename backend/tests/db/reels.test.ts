import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const AUTHOR = "00000000-0000-4000-8000-0000000007a1";
const FRIEND = "00000000-0000-4000-8000-0000000007a2"; // connected to AUTHOR
const STRANGER = "00000000-0000-4000-8000-0000000007a3"; // member, not connected
const BLOCKED = "00000000-0000-4000-8000-0000000007a4"; // blocked by AUTHOR
const MOD = "00000000-0000-4000-8000-0000000007a5";

let db: PGlite;
const uuid = () => crypto.randomUUID();

/** Simulates a completed upload into the reels bucket, as the uploader (storage RLS applies). */
async function upload(user: string, name: string) {
  await asUser(db, user, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner) values ('reels', $1, $2)`, [name, user]));
}

async function postReel(as: string, opts: { visibility?: string; author?: string } = {}): Promise<{ id: string; video: string; poster: string }> {
  const author = opts.author ?? as;
  const video = `${author}/reel_video/${uuid()}.mp4`;
  const poster = `${author}/reel_poster/${uuid()}.jpg`;
  await upload(as, video);
  await upload(as, poster);
  const r = await asUser(db, as, (tx) =>
    tx.query<{ id: string }>(
      `insert into public.reels (author_id, caption, video_path, poster_path, duration_s, width, height, visibility)
       values ($1, 'Sunset over Monaco', $2, $3, 24.5, 1080, 1920, $4) returning id`,
      [author, video, poster, opts.visibility ?? "members"],
    ),
  );
  return { id: r.rows[0]!.id, video, poster };
}

const visibleIds = (user: string | null) =>
  asUser(db, user, async (tx) => (await tx.query<{ id: string }>(`select id from public.reels`)).rows.map((r) => r.id));

const counts = async (id: string) =>
  (
    await db.query<{ like_count: number; comment_count: number; view_count: number; share_count: number }>(
      `select like_count, comment_count, view_count, share_count from public.reels where id = $1`,
      [id],
    )
  ).rows[0]!;

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [AUTHOR, "reel_author"],
    [FRIEND, "reel_friend"],
    [STRANGER, "reel_stranger"],
    [BLOCKED, "reel_blocked"],
    [MOD, "reel_mod"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`insert into public.connections (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [AUTHOR, FRIEND]);
  await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [AUTHOR, BLOCKED]);
  await db.query(`insert into public.staff_roles (user_id, role) values ($1, 'moderator')`, [MOD]);
}, 120_000);

describe("reel visibility", () => {
  it("members reels are visible to members, never to signed-out visitors or blocked members", async () => {
    const { id } = await postReel(AUTHOR);
    expect(await visibleIds(STRANGER)).toContain(id);
    expect(await visibleIds(BLOCKED)).not.toContain(id);
    await expect(visibleIds(null)).rejects.toThrow(/permission denied/);
  });

  it("connections-only reels are hidden from members who aren't connected", async () => {
    const { id } = await postReel(AUTHOR, { visibility: "connections" });
    expect(await visibleIds(FRIEND)).toContain(id);
    expect(await visibleIds(AUTHOR)).toContain(id);
    expect(await visibleIds(STRANGER)).not.toContain(id);
  });

  it("members can only post reels as themselves, with their own uploads", async () => {
    await expect(postReel(STRANGER, { author: AUTHOR })).rejects.toThrow(/row-level security/);
    // A path that doesn't exist in storage is refused.
    await expect(
      asUser(db, STRANGER, (tx) =>
        tx.query(
          `insert into public.reels (author_id, video_path, duration_s, width, height) values ($1, $2, 10, 720, 1280)`,
          [STRANGER, `${STRANGER}/reel_video/${uuid()}.mp4`],
        ),
      ),
    ).rejects.toThrow(/Upload the video first/);
    // Someone else's file can't be used.
    const { video } = await postReel(AUTHOR);
    await expect(
      asUser(db, STRANGER, (tx) =>
        tx.query(`insert into public.reels (author_id, video_path, duration_s, width, height) values ($1, $2, 10, 720, 1280)`, [STRANGER, video]),
      ),
    ).rejects.toThrow(/violates check constraint|duplicate key/);
  });

  it("rejects videos longer than 90 seconds", async () => {
    const video = `${AUTHOR}/reel_video/${uuid()}.mp4`;
    await upload(AUTHOR, video);
    await expect(
      asUser(db, AUTHOR, (tx) =>
        tx.query(`insert into public.reels (author_id, video_path, duration_s, width, height) values ($1, $2, 91, 720, 1280)`, [AUTHOR, video]),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("reel media storage", () => {
  it("files are readable only by people who can see the reel", async () => {
    const { video, poster } = await postReel(AUTHOR, { visibility: "connections" });
    const read = (user: string) =>
      asUser(db, user, async (tx) => (await tx.query(`select name from storage.objects where name in ($1, $2)`, [video, poster])).rows.length);
    expect(await read(FRIEND)).toBe(2);
    expect(await read(STRANGER)).toBe(0);
    expect(await read(BLOCKED)).toBe(0);
  });

  it("members upload only into their own folder", async () => {
    await expect(upload(STRANGER, `${AUTHOR}/reel_video/${uuid()}.mp4`)).rejects.toThrow(/row-level security/);
  });
});

describe("reel engagement", () => {
  it("counters are maintained by the database and can't be written by members", async () => {
    const { id } = await postReel(AUTHOR);
    await asUser(db, FRIEND, (tx) => tx.query(`insert into public.reel_likes (reel_id, user_id) values ($1, $2)`, [id, FRIEND]));
    await asUser(db, STRANGER, (tx) => tx.query(`insert into public.reel_comments (reel_id, author_id, body) values ($1, $2, 'Stunning')`, [id, STRANGER]));
    expect(await counts(id)).toMatchObject({ like_count: 1, comment_count: 1 });
    await expect(asUser(db, AUTHOR, (tx) => tx.query(`update public.reels set like_count = 9999 where id = $1`, [id]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(db, AUTHOR, (tx) => tx.query(`insert into public.reel_views (reel_id, viewer_id) values ($1, $2)`, [id, AUTHOR]))).rejects.toThrow(
      /permission denied/,
    );
    await asUser(db, FRIEND, (tx) => tx.query(`delete from public.reel_likes where reel_id = $1`, [id]));
    expect((await counts(id)).like_count).toBe(0);
  });

  it("likes notify the author once, respecting preferences", async () => {
    const { id } = await postReel(AUTHOR);
    await asUser(db, FRIEND, (tx) => tx.query(`insert into public.reel_likes (reel_id, user_id) values ($1, $2)`, [id, FRIEND]));
    await asUser(db, FRIEND, (tx) => tx.query(`delete from public.reel_likes where reel_id = $1`, [id]));
    await asUser(db, FRIEND, (tx) => tx.query(`insert into public.reel_likes (reel_id, user_id) values ($1, $2)`, [id, FRIEND]));
    const n = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'reel_liked' and entity_id = $2`, [AUTHOR, id]);
    expect(n.rows).toHaveLength(1);
  });

  it("views are deduplicated per member and the author's own plays don't count", async () => {
    const { id } = await postReel(AUTHOR);
    for (const user of [FRIEND, FRIEND, STRANGER, AUTHOR]) {
      await asUser(db, user, (tx) => tx.query(`select public.record_reel_view($1)`, [id]));
    }
    expect((await counts(id)).view_count).toBe(2);
    await expect(asUser(db, BLOCKED, (tx) => tx.query(`select public.record_reel_view($1)`, [id]))).rejects.toThrow(/not found/);
  });

  it("blocked members can't like, comment or share", async () => {
    const { id } = await postReel(AUTHOR);
    await expect(asUser(db, BLOCKED, (tx) => tx.query(`insert into public.reel_likes (reel_id, user_id) values ($1, $2)`, [id, BLOCKED]))).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      asUser(db, BLOCKED, (tx) => tx.query(`insert into public.reel_comments (reel_id, author_id, body) values ($1, $2, 'hi')`, [id, BLOCKED])),
    ).rejects.toThrow(/row-level security/);
    await expect(asUser(db, BLOCKED, (tx) => tx.query(`insert into public.reel_shares (reel_id, user_id) values ($1, $2)`, [id, BLOCKED]))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("shares count, and can only name conversations the sharer is in", async () => {
    const { id } = await postReel(AUTHOR);
    const conv = (await asUser(db, FRIEND, (tx) => tx.query<{ id: string }>(`select public.start_conversation($1) as id`, [AUTHOR]))).rows[0]!.id;
    await asUser(db, FRIEND, (tx) => tx.query(`insert into public.reel_shares (reel_id, user_id, conversation_id) values ($1, $2, $3)`, [id, FRIEND, conv]));
    expect((await counts(id)).share_count).toBe(1);
    await expect(
      asUser(db, STRANGER, (tx) => tx.query(`insert into public.reel_shares (reel_id, user_id, conversation_id) values ($1, $2, $3)`, [id, STRANGER, conv])),
    ).rejects.toThrow(/row-level security/);
  });

  it("the reel author can remove comments on their reel; others can't", async () => {
    const { id } = await postReel(AUTHOR);
    const c = await asUser(db, STRANGER, (tx) =>
      tx.query<{ id: string }>(`insert into public.reel_comments (reel_id, author_id, body) values ($1, $2, 'Spam link') returning id`, [id, STRANGER]),
    );
    const cid = c.rows[0]!.id;
    const byFriend = await asUser(db, FRIEND, (tx) => tx.query(`delete from public.reel_comments where id = $1 returning id`, [cid]));
    expect(byFriend.rows).toHaveLength(0);
    const byAuthor = await asUser(db, AUTHOR, (tx) => tx.query(`delete from public.reel_comments where id = $1 returning id`, [cid]));
    expect(byAuthor.rows).toHaveLength(1);
  });
});

describe("reel feed and moderation", () => {
  it("the feed returns only visible, published reels and honours the exclude list", async () => {
    const pub = await postReel(AUTHOR);
    const priv = await postReel(AUTHOR, { visibility: "connections" });
    const feed = (user: string, exclude: string[] = []) =>
      asUser(db, user, async (tx) => (await tx.query<{ id: string }>(`select id from public.reel_feed(20, $1::uuid[])`, [exclude])).rows.map((r) => r.id));
    const forStranger = await feed(STRANGER);
    expect(forStranger).toContain(pub.id);
    expect(forStranger).not.toContain(priv.id);
    expect(await feed(FRIEND, [pub.id])).not.toContain(pub.id);
    expect(await feed(BLOCKED)).not.toContain(pub.id);
  });

  it("members can report reels and moderators can remove them", async () => {
    const { id } = await postReel(AUTHOR);
    const report = await asUser(db, STRANGER, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'reel', $2, 'inappropriate') returning id`,
        [STRANGER, id],
      ),
    );
    await asUser(db, MOD, (tx) =>
      tx.query(`select public.moderate('remove_content', 'Breaks the community rules', 'reel', $1, null, $2)`, [id, report.rows[0]!.id]),
    );
    expect(await visibleIds(STRANGER)).not.toContain(id);
    expect(await visibleIds(AUTHOR)).toContain(id); // the author still sees it, marked removed
  });

  it("authors can delete their reels; others can't", async () => {
    const { id } = await postReel(AUTHOR);
    const byStranger = await asUser(db, STRANGER, (tx) => tx.query(`delete from public.reels where id = $1 returning id`, [id]));
    expect(byStranger.rows).toHaveLength(0);
    const byAuthor = await asUser(db, AUTHOR, (tx) => tx.query(`delete from public.reels where id = $1 returning id`, [id]));
    expect(byAuthor.rows).toHaveLength(1);
  });
});
