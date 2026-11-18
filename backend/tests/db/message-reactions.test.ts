import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const AMY = "00000000-0000-4000-8000-0000000002a1";
const BEN = "00000000-0000-4000-8000-0000000002a2";
const EVE = "00000000-0000-4000-8000-0000000002a3"; // not a participant

let db: PGlite;
let conversationId = "";
let messageId = "";

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [AMY, "amy_chat"],
    [BEN, "ben_chat"],
    [EVE, "eve_outside"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  // Set up a 1:1 conversation directly (messaging permissions are covered in rls.test.ts).
  conversationId = (await db.query<{ id: string }>(`insert into public.conversations default values returning id`)).rows[0]!.id;
  await db.query(`insert into public.conversation_participants (conversation_id, user_id) values ($1, $2), ($1, $3)`, [conversationId, AMY, BEN]);
  messageId = (
    await db.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, 'Hello Ben', gen_random_uuid()) returning id`,
      [conversationId, AMY],
    )
  ).rows[0]!.id;
}, 120_000);

describe("message reactions", () => {
  it("participants can react and see reactions; outsiders can do neither", async () => {
    await q(BEN, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '❤️')`, [messageId, BEN]);
    expect(await q(AMY, `select emoji from public.message_reactions where message_id = $1`, [messageId])).toEqual([{ emoji: "❤️" }]);
    expect(await q(EVE, `select emoji from public.message_reactions where message_id = $1`, [messageId])).toHaveLength(0);
    await expect(q(EVE, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`, [messageId, EVE])).rejects.toThrow(
      /row-level security/,
    );
  });

  it("members can't react as someone else or remove others' reactions", async () => {
    await expect(q(AMY, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '🔥')`, [messageId, BEN])).rejects.toThrow(
      /row-level security/,
    );
    await q(AMY, `delete from public.message_reactions where message_id = $1 and user_id = $2`, [messageId, BEN]);
    expect(await q(BEN, `select emoji from public.message_reactions where user_id = $1`, [BEN])).toHaveLength(1);
  });

  it("rejects text that isn't an emoji and caps reactions at 6 per member per message", async () => {
    await expect(q(AMY, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, 'lol')`, [messageId, AMY])).rejects.toThrow(
      /check constraint/,
    );
    for (const e of ["👍", "😂", "🔥", "👏", "🙏", "🎉"]) {
      await q(AMY, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, $3)`, [messageId, AMY, e]);
    }
    await expect(q(AMY, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '💯')`, [messageId, AMY])).rejects.toThrow(
      /up to 6/,
    );
    await q(AMY, `delete from public.message_reactions where message_id = $1 and user_id = $2 and emoji = '🎉'`, [messageId, AMY]);
    await q(AMY, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '💯')`, [messageId, AMY]);
  });

  it("broadcasts reaction changes on the conversation topic", async () => {
    const events = await db.query<{ event: string; payload: { op: string } }>(
      `select event, payload from realtime.messages where topic = $1 and event = 'reaction.changed' order by id`,
      [`conversation:${conversationId}`],
    );
    expect(events.rows.length).toBeGreaterThan(0);
    expect(new Set(events.rows.map((e) => e.payload.op))).toEqual(new Set(["add", "remove"]));
  });

  it("blocked members can't react", async () => {
    await db.query(`insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [AMY, BEN]);
    await expect(q(BEN, `insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👏')`, [messageId, BEN])).rejects.toThrow(
      /row-level security/,
    );
    await db.query(`delete from public.user_blocks where blocker_id = $1`, [AMY]);
  });
});

describe("read receipts privacy", () => {
  const readState = (user: string) =>
    q<{ user_id: string; last_read_at: string | null; receipts_visible: boolean }>(user, `select * from public.conversation_read_state($1)`, [
      conversationId,
    ]);

  it("other participants' last_read_at is not directly readable", async () => {
    await q(BEN, `update public.conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2`, [conversationId, BEN]);
    await expect(q(AMY, `select last_read_at from public.conversation_participants where conversation_id = $1`, [conversationId])).rejects.toThrow(
      /permission denied/,
    );
    // Participants can still list who is in the conversation.
    expect(await q(AMY, `select user_id from public.conversation_participants where conversation_id = $1`, [conversationId])).toHaveLength(2);
  });

  it("read times are shared when both have receipts on", async () => {
    const amySees = await readState(AMY);
    expect(amySees.find((r) => r.user_id === BEN)!.last_read_at).not.toBeNull();
    expect(await readState(EVE)).toHaveLength(0);
  });

  it("is reciprocal: if either turns receipts off, neither sees the other's read time", async () => {
    await q(AMY, `update public.profiles set show_read_receipts = false where id = $1`, [AMY]);
    await q(AMY, `update public.conversation_participants set last_read_at = now() where conversation_id = $1 and user_id = $2`, [conversationId, AMY]);
    const amySees = await readState(AMY);
    expect(amySees.find((r) => r.user_id === BEN)).toMatchObject({ last_read_at: null, receipts_visible: false });
    expect(amySees.find((r) => r.user_id === AMY)!.last_read_at).not.toBeNull(); // own state always visible
    const benSees = await readState(BEN);
    expect(benSees.find((r) => r.user_id === AMY)).toMatchObject({ last_read_at: null, receipts_visible: false });
  });

  it("doesn't broadcast read events while anyone in the conversation has receipts off", async () => {
    const count = async () =>
      Number(
        (
          await db.query<{ n: number }>(`select count(*)::int as n from realtime.messages where topic = $1 and event = 'conversation.read'`, [
            `conversation:${conversationId}`,
          ])
        ).rows[0]!.n,
      );
    const before = await count();
    await q(BEN, `update public.conversation_participants set last_read_at = now() + interval '1 minute' where conversation_id = $1 and user_id = $2`, [
      conversationId,
      BEN,
    ]);
    expect(await count()).toBe(before);
    await q(AMY, `update public.profiles set show_read_receipts = true where id = $1`, [AMY]);
    await q(BEN, `update public.conversation_participants set last_read_at = now() + interval '2 minutes' where conversation_id = $1 and user_id = $2`, [
      conversationId,
      BEN,
    ]);
    expect(await count()).toBe(before + 1);
  });

  it("unread counts in the conversation list still work", async () => {
    await db.query(`insert into public.messages (conversation_id, sender_id, body, client_id, created_at) values ($1, $2, 'New', gen_random_uuid(), now() + interval '1 hour')`, [
      conversationId,
      AMY,
    ]);
    const rows = await q<{ conversation_id: string; unread_count: string }>(BEN, `select * from public.conversation_summaries(30, null)`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.unread_count)).toBe(1);
    expect(await q(EVE, `select * from public.conversation_summaries(30, null)`)).toHaveLength(0);
  });
});
