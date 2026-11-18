import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const AUTHOR = "00000000-0000-4000-8000-0000000002a1";
const VOTER = "00000000-0000-4000-8000-0000000002a2";
const FRIEND = "00000000-0000-4000-8000-0000000002a3"; // connected to AUTHOR
const FRESH = "00000000-0000-4000-8000-0000000002a4"; // not onboarded

let db: PGlite;

const as = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

async function post(visibility = "members"): Promise<string> {
  const rows = await as<{ id: string }>(AUTHOR, `insert into public.posts (author_id, body, visibility) values ($1, 'Which?', $2) returning id`, [AUTHOR, visibility]);
  return rows[0]!.id;
}

async function poll(postId: string, options = ["Monaco", "Dubai", "Aspen"], multiple = false, hours = 72) {
  await as(AUTHOR, `select public.create_post_poll($1, $2, null, $3, $4)`, [postId, options, multiple, hours]);
  return (await as<{ id: string }>(AUTHOR, `select id from public.post_poll_options where post_id = $1 order by position`, [postId])).map((r) => r.id);
}

const results = (user: string | null, postId: string) =>
  as<{ option_id: string; votes: number; viewer_voted: boolean }>(user, `select option_id, votes, viewer_voted from public.poll_results($1)`, [[postId]]);

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [AUTHOR, "poll_author"],
    [VOTER, "poll_voter"],
    [FRIEND, "poll_friend"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "poll_fresh", onboarded: false });
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [AUTHOR, FRIEND]);
}, 120_000);

describe("polls", () => {
  it("only the author can add a poll, once, with 2–4 distinct options", async () => {
    const p = await post();
    await expect(as(VOTER, `select public.create_post_poll($1, $2)`, [p, ["a", "b"]])).rejects.toThrow(/not found/);
    await expect(as(AUTHOR, `select public.create_post_poll($1, $2)`, [p, ["only one"]])).rejects.toThrow(/2 to 4/);
    await expect(as(AUTHOR, `select public.create_post_poll($1, $2)`, [p, ["a", "b", "c", "d", "e"]])).rejects.toThrow(/2 to 4/);
    await expect(as(AUTHOR, `select public.create_post_poll($1, $2)`, [p, ["Same", "same"]])).rejects.toThrow(/different/);
    await poll(p);
    await expect(as(AUTHOR, `select public.create_post_poll($1, $2)`, [p, ["x", "y"]])).rejects.toThrow(/already has a poll/);
  });

  it("enforces single choice, lets voters change their vote, and returns counts only", async () => {
    const p = await post();
    const [a, b] = await poll(p);
    await expect(as(VOTER, `select public.vote_poll($1, $2)`, [p, [a, b]])).rejects.toThrow(/one choice/);
    await as(VOTER, `select public.vote_poll($1, $2)`, [p, [a]]);
    await as(VOTER, `select public.vote_poll($1, $2)`, [p, [b]]);
    const r = await results(VOTER, p);
    expect(r.find((x) => x.option_id === a)).toMatchObject({ votes: 0, viewer_voted: false });
    expect(r.find((x) => x.option_id === b)).toMatchObject({ votes: 1, viewer_voted: true });
    // Nobody — not even the author — can read who voted.
    await expect(as(AUTHOR, `select user_id from public.post_poll_votes`)).rejects.toThrow(/permission denied/);
    await expect(as(VOTER, `insert into public.post_poll_votes (post_id, option_id, user_id) values ($1, $2, $3)`, [p, a, VOTER])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("allows several choices only when the poll permits it, and rejects options from other polls", async () => {
    const p = await post();
    const [a, b] = await poll(p, ["One", "Two"], true);
    await as(VOTER, `select public.vote_poll($1, $2)`, [p, [a, b]]);
    expect((await results(VOTER, p)).every((x) => x.viewer_voted)).toBe(true);
    const other = await post();
    const [z] = await poll(other, ["Z1", "Z2"]);
    await expect(as(VOTER, `select public.vote_poll($1, $2)`, [p, [z]])).rejects.toThrow(/Invalid option/);
  });

  it("only lets members who can see the post vote, and hides results otherwise", async () => {
    const p = await post("connections");
    const [a] = await poll(p, ["Yes", "No"]);
    await expect(as(VOTER, `select public.vote_poll($1, $2)`, [p, [a]])).rejects.toThrow(/not found/);
    expect(await results(VOTER, p)).toHaveLength(0);
    expect(await as(VOTER, `select 1 from public.post_poll_options where post_id = $1`, [p])).toHaveLength(0);
    await as(FRIEND, `select public.vote_poll($1, $2)`, [p, [a]]);
    await expect(as(FRESH, `select public.vote_poll($1, $2)`, [p, [a]])).rejects.toThrow(/active members/);
    await expect(as(null, `select public.vote_poll($1, $2)`, [p, [a]])).rejects.toThrow(/permission denied/);
  });

  it("rejects votes once a poll has closed", async () => {
    const p = await post();
    const [a] = await poll(p, ["Early", "Late"], false, 1);
    await db.query(`update public.post_polls set created_at = now() - interval '2 hours', closes_at = now() - interval '1 minute' where post_id = $1`, [p]);
    await expect(as(VOTER, `select public.vote_poll($1, $2)`, [p, [a]])).rejects.toThrow(/closed/);
    await expect(as(VOTER, `select public.clear_poll_vote($1)`, [p])).rejects.toThrow(/closed/);
  });

  it("locks options: nobody can edit them, before or after votes", async () => {
    const p = await post();
    const [a] = await poll(p, ["Keep", "Change"]);
    await as(VOTER, `select public.vote_poll($1, $2)`, [p, [a]]);
    await expect(as(AUTHOR, `update public.post_poll_options set label = 'Changed' where id = $1`, [a])).rejects.toThrow(/permission denied/);
    await expect(as(AUTHOR, `delete from public.post_poll_options where id = $1`, [a])).rejects.toThrow(/permission denied/);
    await expect(as(AUTHOR, `update public.post_polls set closes_at = now() + interval '10 days' where post_id = $1`, [p])).rejects.toThrow(/permission denied/);
  });

  it("can't add a poll to an older post", async () => {
    const p = await post();
    await db.query(`update public.posts set created_at = now() - interval '1 hour' where id = $1`, [p]);
    await expect(as(AUTHOR, `select public.create_post_poll($1, $2)`, [p, ["a", "b"]])).rejects.toThrow(/when the post is created/);
  });
});

describe("collections", () => {
  let collectionId: string;

  it("are private to their owner", async () => {
    const rows = await as<{ id: string }>(VOTER, `insert into public.collections (name) values ('Monaco trip') returning id`);
    collectionId = rows[0]!.id;
    expect(await as(AUTHOR, `select id from public.collections`)).toHaveLength(0);
    expect(await as(null, `select 1`)).toHaveLength(1);
    await expect(as(null, `select id from public.collections`)).rejects.toThrow(/permission denied/);
    // Names are unique per owner, ignoring case.
    await expect(as(VOTER, `insert into public.collections (name) values ('monaco TRIP')`)).rejects.toThrow(/duplicate|unique/);
    // Can't plant a collection on someone else.
    await expect(as(VOTER, `insert into public.collections (owner_id, name) values ($1, 'x')`, [AUTHOR])).rejects.toThrow(/permission denied/);
  });

  it("only accepts items the owner can see, and only in their own collections", async () => {
    const visible = await post("members");
    const hidden = await post("connections");
    await as(VOTER, `insert into public.collection_items (collection_id, item_type, item_id) values ($1, 'post', $2)`, [collectionId, visible]);
    await expect(
      as(VOTER, `insert into public.collection_items (collection_id, item_type, item_id) values ($1, 'post', $2)`, [collectionId, hidden]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(AUTHOR, `insert into public.collection_items (collection_id, item_type, item_id) values ($1, 'post', $2)`, [collectionId, visible]),
    ).rejects.toThrow(/row-level security/);
    expect(await as(AUTHOR, `select 1 from public.collection_items`)).toHaveLength(0);
    expect(await as(VOTER, `select 1 from public.collection_items`)).toHaveLength(1);
  });

  it("removes items when the post is deleted", async () => {
    const p = await post("members");
    await as(VOTER, `insert into public.collection_items (collection_id, item_type, item_id) values ($1, 'post', $2)`, [collectionId, p]);
    await as(AUTHOR, `delete from public.posts where id = $1`, [p]);
    expect(await as(VOTER, `select 1 from public.collection_items where item_id = $1`, [p])).toHaveLength(0);
  });

  it("caps collections at 50 per member", async () => {
    for (let i = 0; i < 49; i++) await as(FRIEND, `insert into public.collections (name) values ($1)`, [`List ${i}`]);
    await as(FRIEND, `insert into public.collections (name) values ('List 49')`);
    await expect(as(FRIEND, `insert into public.collections (name) values ('One too many')`)).rejects.toThrow(/up to 50/);
  });

  it("caps items at 500 per collection", async () => {
    const rows = await as<{ id: string }>(AUTHOR, `insert into public.collections (name) values ('Big') returning id`);
    const big = rows[0]!.id;
    // Fill directly as the database owner (fast), then check the trigger as the member.
    await db.query(
      `insert into public.collection_items (collection_id, item_type, item_id) select $1, 'post', gen_random_uuid() from generate_series(1, 500)`,
      [big],
    );
    const p = await post("members");
    await expect(
      as(AUTHOR, `insert into public.collection_items (collection_id, item_type, item_id) values ($1, 'post', $2)`, [big, p]),
    ).rejects.toThrow(/up to 500/);
  });
});
