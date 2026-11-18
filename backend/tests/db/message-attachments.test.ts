import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const ANA = "00000000-0000-4000-8000-0000000002a1";
const BEN = "00000000-0000-4000-8000-0000000002a2";
const EVE = "00000000-0000-4000-8000-0000000002a3"; // not in the conversation

let db: PGlite;
let conv = "";
let otherConv = "";

const uuid = () => crypto.randomUUID();
const path = (conversation: string, sender: string, ext = "jpg") => `${conversation}/${sender}/${uuid()}.${ext}`;

/** Simulates a completed Storage upload (as the uploader, so storage RLS applies). */
async function upload(user: string, name: string, mime = "image/jpeg", size = 1000) {
  await asUser(db, user, (tx) =>
    tx.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('message-attachments', $1, $2, $3)`, [
      name,
      user,
      JSON.stringify({ size, mimetype: mime }),
    ]),
  );
}

function send(user: string, conversation: string, body: string, attachments: unknown[], clientId = uuid()) {
  return asUser(db, user, (tx) =>
    tx.query<{ id: string }>(`select public.send_message_with_attachments($1, $2, $3, $4::jsonb) as id`, [
      conversation,
      clientId,
      body,
      JSON.stringify(attachments),
    ]),
  );
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [ANA, "ana_files"],
    [BEN, "ben_files"],
    [EVE, "eve_files"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [ANA, BEN]);
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [ANA, EVE]);
  conv = (await asUser(db, ANA, (tx) => tx.query<{ id: string }>(`select public.start_conversation($1) as id`, [BEN]))).rows[0]!.id;
  otherConv = (await asUser(db, ANA, (tx) => tx.query<{ id: string }>(`select public.start_conversation($1) as id`, [EVE]))).rows[0]!.id;
}, 120_000);

describe("message attachment storage", () => {
  it("participants upload only into their own sender folder of their conversation", async () => {
    await upload(ANA, path(conv, ANA));
    await expect(upload(ANA, path(conv, BEN))).rejects.toThrow(/row-level security/);
    await expect(upload(EVE, path(conv, EVE))).rejects.toThrow(/row-level security/);
    await expect(upload(ANA, `not-a-uuid/${ANA}/x.jpg`)).rejects.toThrow(/row-level security/);
  });

  it("only conversation participants can read the files", async () => {
    const name = path(conv, ANA);
    await upload(ANA, name);
    const asBen = await asUser(db, BEN, (tx) => tx.query(`select name from storage.objects where name = $1`, [name]));
    expect(asBen.rows).toHaveLength(1);
    const asEve = await asUser(db, EVE, (tx) => tx.query(`select name from storage.objects where name = $1`, [name]));
    expect(asEve.rows).toHaveLength(0);
  });
});

describe("sending messages with attachments", () => {
  it("sends an attachment-only message that participants (and only they) can see", async () => {
    const name = path(conv, ANA, "pdf");
    await upload(ANA, name, "application/pdf", 2048);
    const r = await send(ANA, conv, "", [{ path: name, mimeType: "application/pdf", size: 2048, fileName: "Term sheet.pdf" }]);
    const id = r.rows[0]!.id;
    const seen = await asUser(db, BEN, (tx) =>
      tx.query<{ kind: string; file_name: string }>(`select kind, file_name from public.message_attachments where message_id = $1`, [id]),
    );
    expect(seen.rows).toEqual([{ kind: "document", file_name: "Term sheet.pdf" }]);
    const hidden = await asUser(db, EVE, (tx) => tx.query(`select 1 from public.message_attachments where message_id = $1`, [id]));
    expect(hidden.rows).toHaveLength(0);
    const updated = await db.query(`select 1 from realtime.messages where event = 'message.updated' and payload->>'id' = $1`, [id]);
    expect(updated.rows).toHaveLength(1);
  });

  it("is idempotent on the client id", async () => {
    const name = path(conv, ANA);
    await upload(ANA, name);
    const clientId = uuid();
    const a = await send(ANA, conv, "photo", [{ path: name, mimeType: "image/jpeg", size: 1000, fileName: "a.jpg" }], clientId);
    const b = await send(ANA, conv, "photo", [{ path: name, mimeType: "image/jpeg", size: 1000, fileName: "a.jpg" }], clientId);
    expect(a.rows[0]!.id).toBe(b.rows[0]!.id);
  });

  it("rejects files outside the sender's folder, unsupported types, size mismatches, oversize and too many files", async () => {
    const benFile = path(conv, BEN);
    await upload(BEN, benFile);
    await expect(send(ANA, conv, "", [{ path: benFile, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }])).rejects.toThrow(/upload folder/);

    const foreign = path(otherConv, ANA);
    await upload(ANA, foreign);
    await expect(send(ANA, conv, "", [{ path: foreign, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }])).rejects.toThrow(/upload folder/);

    const exe = path(conv, ANA, "exe");
    await upload(ANA, exe, "application/x-msdownload");
    await expect(send(ANA, conv, "", [{ path: exe, mimeType: "application/x-msdownload", size: 1000, fileName: "x.exe" }])).rejects.toThrow(
      /not allowed/,
    );

    const liar = path(conv, ANA);
    await upload(ANA, liar, "image/jpeg", 5000);
    await expect(send(ANA, conv, "", [{ path: liar, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }])).rejects.toThrow(/size does not match/);

    const big = path(conv, ANA);
    await upload(ANA, big, "image/jpeg", 16 * 1024 * 1024);
    await expect(send(ANA, conv, "", [{ path: big, mimeType: "image/jpeg", size: 16 * 1024 * 1024, fileName: "x.jpg" }])).rejects.toThrow(
      /too large/,
    );

    const missing = path(conv, ANA);
    await expect(send(ANA, conv, "", [{ path: missing, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }])).rejects.toThrow(/not found/);

    const eleven = Array.from({ length: 11 }, () => ({ path: path(conv, ANA), mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }));
    await expect(send(ANA, conv, "", eleven)).rejects.toThrow(/between 1 and 10/);
  });

  it("non-participants cannot send, and attachment rows can't be written directly", async () => {
    const name = path(conv, EVE);
    await expect(send(EVE, conv, "hi", [{ path: name, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }])).rejects.toThrow(/not found/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(
          `insert into public.message_attachments (message_id, conversation_id, storage_path, file_name, mime_type, size_bytes, kind)
           select id, conversation_id, 'x', 'x', 'image/jpeg', 1, 'image' from public.messages limit 1`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("still rejects empty text messages and can't fake has_attachments", async () => {
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.messages (conversation_id, sender_id, body, client_id) values ($1, $2, '   ', gen_random_uuid())`, [conv, ANA]),
      ),
    ).rejects.toThrow(/messages_body_check/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`insert into public.messages (conversation_id, sender_id, body, client_id, has_attachments) values ($1, $2, '', gen_random_uuid(), true)`, [
          conv,
          ANA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("uploaders can delete unsent files but not sent ones", async () => {
    const unsent = path(conv, ANA);
    await upload(ANA, unsent);
    const del = await asUser(db, ANA, (tx) => tx.query(`delete from storage.objects where name = $1 returning name`, [unsent]));
    expect(del.rows).toHaveLength(1);

    const sent = path(conv, ANA);
    await upload(ANA, sent);
    await send(ANA, conv, "", [{ path: sent, mimeType: "image/jpeg", size: 1000, fileName: "x.jpg" }]);
    const kept = await asUser(db, ANA, (tx) => tx.query(`delete from storage.objects where name = $1 returning name`, [sent]));
    expect(kept.rows).toHaveLength(0);
  });
});
