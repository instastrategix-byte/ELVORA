import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const AUTHOR = "00000000-0000-4000-8000-0000000005a1";
const FRIEND = "00000000-0000-4000-8000-0000000005a2"; // connected to AUTHOR
const STRANGER = "00000000-0000-4000-8000-0000000005a3"; // member, not connected
const FRESH = "00000000-0000-4000-8000-0000000005a4"; // not onboarded: no feed.post
const PROLIFIC = "00000000-0000-4000-8000-0000000005a5";

let db: PGlite;

const path = (user: string, n = 0) => `${user}/story_image/${n.toString().padStart(8, "0")}-0000-4000-8000-000000000000.jpg`;

async function postStory(as: string, opts: { author?: string; visibility?: string; n?: number } = {}): Promise<string> {
  const author = opts.author ?? as;
  return asUser(db, as, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.stories (author_id, media_path, media_type, visibility) values ($1, $2, 'image', $3) returning id`,
      [author, path(author, opts.n ?? 0), opts.visibility ?? "members"],
    );
    return r.rows[0]!.id;
  });
}

async function visibleStoryIds(userId: string | null): Promise<string[]> {
  return asUser(db, userId, async (tx) => (await tx.query<{ id: string }>(`select id from public.stories`)).rows.map((r) => r.id));
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [AUTHOR, "story_author"],
    [FRIEND, "story_friend"],
    [STRANGER, "story_stranger"],
    [PROLIFIC, "story_prolific"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "story_fresh", onboarded: false });
  await db.query(`insert into public.connections (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [AUTHOR, FRIEND]);
}, 60_000);

describe("story visibility", () => {
  it("members-only stories are visible to active members but never to signed-out visitors", async () => {
    const id = await postStory(AUTHOR, { n: 1 });
    expect(await visibleStoryIds(STRANGER)).toContain(id);
    expect(await visibleStoryIds(FRIEND)).toContain(id);
    await expect(visibleStoryIds(null)).rejects.toThrow(/permission denied/);
  });

  it("connections-only stories are hidden from members who are not connected", async () => {
    const id = await postStory(AUTHOR, { visibility: "connections", n: 2 });
    expect(await visibleStoryIds(FRIEND)).toContain(id);
    expect(await visibleStoryIds(AUTHOR)).toContain(id);
    expect(await visibleStoryIds(STRANGER)).not.toContain(id);
  });

  it("expired stories are hidden from everyone, including the author", async () => {
    const r = await db.query<{ id: string }>(
      `insert into public.stories (author_id, media_path, media_type, created_at, expires_at)
       values ($1, $2, 'image', now() - interval '25 hours', now() - interval '1 hour') returning id`,
      [AUTHOR, path(AUTHOR, 3)],
    );
    const id = r.rows[0]!.id;
    expect(await visibleStoryIds(AUTHOR)).not.toContain(id);
    expect(await visibleStoryIds(FRIEND)).not.toContain(id);
  });

  it("public visibility is not allowed for stories", async () => {
    await expect(postStory(AUTHOR, { visibility: "public", n: 4 })).rejects.toThrow(/check constraint/);
  });
});

describe("posting stories", () => {
  it("members cannot post a story as someone else", async () => {
    await expect(postStory(STRANGER, { author: AUTHOR, n: 5 })).rejects.toThrow(/row-level security/);
  });

  it("media must come from the author's own folder", async () => {
    await expect(
      asUser(db, STRANGER, (tx) =>
        tx.query(`insert into public.stories (author_id, media_path, media_type) values ($1, $2, 'image')`, [STRANGER, path(AUTHOR, 6)]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("members without the posting feature cannot post stories", async () => {
    await expect(postStory(FRESH, { n: 7 })).rejects.toThrow(/row-level security/);
  });

  it("clients cannot extend a story's lifetime", async () => {
    await expect(
      asUser(db, AUTHOR, (tx) =>
        tx.query(
          `insert into public.stories (author_id, media_path, media_type, expires_at) values ($1, $2, 'image', now() + interval '30 days')`,
          [AUTHOR, path(AUTHOR, 8)],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("an author can have at most 20 active stories", async () => {
    for (let n = 0; n < 20; n++) await postStory(PROLIFIC, { n: 100 + n });
    await expect(postStory(PROLIFIC, { n: 200 })).rejects.toThrow(/at most 20 active stories/);
  });

  it("only the author (or a moderator) can delete a story", async () => {
    const id = await postStory(AUTHOR, { n: 9 });
    const deletedByStranger = await asUser(db, STRANGER, (tx) => tx.query(`delete from public.stories where id = $1`, [id]));
    expect(deletedByStranger.affectedRows ?? 0).toBe(0);
    const deletedByAuthor = await asUser(db, AUTHOR, (tx) => tx.query(`delete from public.stories where id = $1`, [id]));
    expect(deletedByAuthor.affectedRows).toBe(1);
  });
});

describe("story views", () => {
  it("viewers record only their own views, and only for stories they can see", async () => {
    const open = await postStory(AUTHOR, { n: 10 });
    const privateStory = await postStory(AUTHOR, { visibility: "connections", n: 11 });

    await asUser(db, STRANGER, (tx) => tx.query(`insert into public.story_views (story_id, viewer_id) values ($1, $2)`, [open, STRANGER]));
    await expect(
      asUser(db, STRANGER, (tx) => tx.query(`insert into public.story_views (story_id, viewer_id) values ($1, $2)`, [open, FRIEND])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, STRANGER, (tx) => tx.query(`insert into public.story_views (story_id, viewer_id) values ($1, $2)`, [privateStory, STRANGER])),
    ).rejects.toThrow(/row-level security/);
  });

  it("authors see who viewed their stories; other members see only their own views", async () => {
    const id = await postStory(AUTHOR, { n: 12 });
    for (const viewer of [FRIEND, STRANGER]) {
      await asUser(db, viewer, (tx) => tx.query(`insert into public.story_views (story_id, viewer_id) values ($1, $2)`, [id, viewer]));
    }
    const forAuthor = await asUser(db, AUTHOR, (tx) => tx.query<{ viewer_id: string }>(`select viewer_id from public.story_views where story_id = $1`, [id]));
    expect(forAuthor.rows.map((r) => r.viewer_id).sort()).toEqual([FRIEND, STRANGER].sort());
    const forFriend = await asUser(db, FRIEND, (tx) => tx.query<{ viewer_id: string }>(`select viewer_id from public.story_views where story_id = $1`, [id]));
    expect(forFriend.rows.map((r) => r.viewer_id)).toEqual([FRIEND]);
  });
});
