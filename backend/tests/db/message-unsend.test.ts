import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const ANA = "00000000-0000-4000-8000-0000000003a1";
const BEN = "00000000-0000-4000-8000-0000000003a2";
const EVE = "00000000-0000-4000-8000-0000000003a3"; // not in the conversation

let db: PGlite;
let conv = "";
const uuid = () => crypto.randomUUID();

async function sendText(user: string, body: string): Promise<string> {
  const r = await asUser(db, user, (tx) =>
    tx.query<{ id: string }>(
      `insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, $3, $4) returning id`,
      [conv, user, body, uuid()],
    ),
  );
  return r.rows[0]!.id;
}

function unsend(user: string, id: string) {
  return asUser(db, user, (tx) => tx.query<{ paths: string[] }>(`select public.unsend_message($1) as paths`, [id]));
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [ANA, "ana_unsend"],
    [BEN, "ben_unsend"],
    [EVE, "eve_unsend"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [ANA, BEN]);
  conv = (await asUser(db, ANA, (tx) => tx.query<{ id: string }>(`select public.start_conversation($1) as id`, [BEN]))).rows[0]!.id;
}, 120_000);

describe("unsend_message", () => {
  it("lets the sender unsend within 10 minutes and wipes the content for everyone", async () => {
    const id = await sendText(ANA, "Wrong chat, sorry");
    await asUser(db, BEN, (tx) => tx.query(`insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '👍')`, [id, BEN]));

    await unsend(ANA, id);

    const seen = await asUser(db, BEN, (tx) =>
      tx.query<{ body: string; unsent: boolean; has_attachments: boolean }>(
        `select body, unsent_at is not null as unsent, has_attachments from public.messages where id = $1`,
        [id],
      ),
    );
    expect(seen.rows).toEqual([{ body: "", unsent: true, has_attachments: false }]);
    const reactions = await asUser(db, BEN, (tx) => tx.query(`select 1 from public.message_reactions where message_id = $1`, [id]));
    expect(reactions.rows).toHaveLength(0);
    const broadcast = await db.query(`select 1 from realtime.messages where event = 'message.unsent' and payload->>'id' = $1`, [id]);
    expect(broadcast.rows).toHaveLength(1);
    // No new reactions on a tombstone.
    await expect(
      asUser(db, BEN, (tx) => tx.query(`insert into public.message_reactions (message_id, user_id, emoji) values ($1, $2, '❤️')`, [id, BEN])),
    ).rejects.toThrow(/row-level security/);
  });

  it("removes attachment rows and returns their paths for storage cleanup", async () => {
    const name = `${conv}/${ANA}/${uuid()}.jpg`;
    await asUser(db, ANA, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('message-attachments', $1, $2, $3)`, [
        name,
        ANA,
        JSON.stringify({ size: 1000, mimetype: "image/jpeg" }),
      ]),
    );
    const sent = await asUser(db, ANA, (tx) =>
      tx.query<{ id: string }>(`select public.send_message_with_attachments($1, $2, '', $3::jsonb) as id`, [
        conv,
        uuid(),
        JSON.stringify([{ path: name, mimeType: "image/jpeg", size: 1000, fileName: "photo.jpg" }]),
      ]),
    );
    const id = sent.rows[0]!.id;
    const r = await unsend(ANA, id);
    expect(r.rows[0]!.paths).toEqual([name]);
    const left = await asUser(db, BEN, (tx) => tx.query(`select 1 from public.message_attachments where message_id = $1`, [id]));
    expect(left.rows).toHaveLength(0);
    // With the row gone, the uploader may now delete the file itself.
    const removed = await asUser(db, ANA, (tx) => tx.query(`delete from storage.objects where name = $1 returning name`, [name]));
    expect(removed.rows).toHaveLength(1);
  });

  it("is idempotent", async () => {
    const id = await sendText(ANA, "twice");
    await unsend(ANA, id);
    const again = await unsend(ANA, id);
    expect(again.rows[0]!.paths).toEqual([]);
  });

  it("rejects messages older than 10 minutes", async () => {
    const id = await sendText(ANA, "old news");
    await db.query(`update public.messages set created_at = now() - interval '11 minutes' where id = $1`, [id]);
    await expect(unsend(ANA, id)).rejects.toThrow(/within 10 minutes/);
    const still = await db.query<{ body: string }>(`select body from public.messages where id = $1`, [id]);
    expect(still.rows[0]!.body).toBe("old news");
  });

  it("rejects other participants and outsiders", async () => {
    const id = await sendText(ANA, "mine");
    await expect(unsend(BEN, id)).rejects.toThrow(/only unsend your own/);
    await expect(unsend(EVE, id)).rejects.toThrow(/not found/);
    await expect(unsend(null as unknown as string, id)).rejects.toThrow();
  });

  it("still gives users no way to edit a message directly", async () => {
    const id = await sendText(ANA, "original");
    await expect(
      asUser(db, ANA, (tx) => tx.query(`update public.messages set body = 'edited' where id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, ANA, (tx) => tx.query(`update public.messages set unsent_at = now(), body = '' where id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
  });

  it("shows the unsent state in the conversation list and doesn't count it as unread", async () => {
    const id = await sendText(ANA, "last one");
    await unsend(ANA, id);
    const benView = await asUser(db, BEN, (tx) =>
      tx.query<{ last_message_unsent: boolean; last_message_body: string; unread_count: string }>(
        `select last_message_unsent, last_message_body, unread_count from public.conversation_summaries()`,
      ),
    );
    const row = benView.rows[0]!;
    expect(row.last_message_unsent).toBe(true);
    expect(row.last_message_body).toBe("");
    // Only the earlier still-sent messages from Ana may be unread for Ben; the tombstone never is.
    const unsentUnread = await asUser(db, BEN, (tx) =>
      tx.query<{ n: string }>(`select count(*) as n from public.messages where conversation_id = $1 and unsent_at is not null`, [conv]),
    );
    expect(Number(unsentUnread.rows[0]!.n)).toBeGreaterThan(0);
    const totalFromAna = await asUser(db, BEN, (tx) =>
      tx.query<{ n: string }>(`select count(*) as n from public.messages where conversation_id = $1 and sender_id = $2 and unsent_at is null`, [conv, ANA]),
    );
    expect(Number(row.unread_count)).toBe(Number(totalFromAna.rows[0]!.n));
  });
});
