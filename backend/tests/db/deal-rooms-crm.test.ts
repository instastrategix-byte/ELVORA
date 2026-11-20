import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const OWN = "00000000-0000-4000-8000-0000000002d1"; // room owner
const ADM = "00000000-0000-4000-8000-0000000002d2"; // admin (connected to owner)
const MEM = "00000000-0000-4000-8000-0000000002d3"; // member (connected to owner)
const VEW = "00000000-0000-4000-8000-0000000002d4"; // viewer (connected to owner)
const OUT = "00000000-0000-4000-8000-0000000002d5"; // stranger (not connected)

let db: PGlite;
let room: string;
let doc: string;
const NDA = "The recipient will keep everything in this room strictly confidential.";

const q = <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

async function connect(a: string, b: string) {
  await db.query(`insert into public.connections (requester_id, addressee_id, status, responded_at) values ($1, $2, 'accepted', now())`, [a, b]);
}

async function upload(user: string, name: string, size = 1000, mime = "application/pdf") {
  await q(user, `insert into storage.objects (bucket_id, name, owner, metadata) values ('deal-room-files', $1, $2, $3)`, [
    name,
    user,
    JSON.stringify({ size, mimetype: mime }),
  ]);
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [OWN, "dr_owner"],
    [ADM, "dr_admin"],
    [MEM, "dr_member"],
    [VEW, "dr_viewer"],
    [OUT, "dr_outsider"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await connect(OWN, ADM);
  await connect(OWN, MEM);
  await connect(VEW, OWN);
}, 120_000);

describe("deal rooms", () => {
  it("creates a room with the owner as the only full-access member", async () => {
    const r = await q<{ id: string }>(OWN, `select public.create_deal_room('Project Atlas', 'Series B', true, $1) as id`, [NDA]);
    room = r[0]!.id;
    expect(await q(OWN, `select name from public.deal_rooms where id = $1`, [room])).toHaveLength(1);
    expect(await q(MEM, `select name from public.deal_rooms where id = $1`, [room])).toHaveLength(0);
    await expect(q(OWN, `select public.create_deal_room('No terms', null, true, null)`)).rejects.toThrow(/NDA text/);
  });

  it("blocks direct writes to rooms and members", async () => {
    await expect(q(OWN, `insert into public.deal_rooms (owner_id, name) values ($1, 'Direct')`, [OWN])).rejects.toThrow(/permission denied/);
    await expect(q(OWN, `insert into public.deal_room_members (room_id, user_id, role) values ($1, $2, 'member')`, [room, OUT])).rejects.toThrow(
      /permission denied/,
    );
    await expect(q(OWN, `update public.deal_rooms set status = 'closed' where id = $1`, [room])).rejects.toThrow(/permission denied/);
  });

  it("invites only the inviter's connections", async () => {
    await expect(q(OWN, `select public.invite_to_deal_room($1, $2, 'member')`, [room, OUT])).rejects.toThrow(/only invite your connections/);
    await q(OWN, `select public.invite_to_deal_room($1, $2, 'admin')`, [room, ADM]);
    await q(OWN, `select public.invite_to_deal_room($1, $2, 'member')`, [room, MEM]);
    await q(OWN, `select public.invite_to_deal_room($1, $2, 'viewer')`, [room, VEW]);
    await expect(q(MEM, `select public.invite_to_deal_room($1, $2, 'member')`, [room, OUT])).rejects.toThrow(/not found/);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.notifications where type = 'deal_room_invite' and entity_id = $1`, [room]);
    expect(n.rows[0]!.n).toBe(3);
  });

  it("invitees see only the room name and NDA until they accept the current version", async () => {
    const inv = await q<{ name: string; nda_text: string; nda_version: number }>(MEM, `select * from public.deal_room_invitations()`);
    expect(inv).toHaveLength(1);
    expect(inv[0]!.name).toBe("Project Atlas");
    expect(inv[0]!.nda_text).toBe(NDA);
    expect(await q(MEM, `select * from public.deal_rooms where id = $1`, [room])).toHaveLength(0);
    await expect(q(MEM, `select public.join_deal_room($1, 99)`, [room])).rejects.toThrow(/NDA has changed/);
    for (const u of [ADM, MEM, VEW]) await q(u, `select public.join_deal_room($1, 1)`, [room]);
    expect(await q(MEM, `select description from public.deal_rooms where id = $1`, [room])).toEqual([{ description: "Series B" }]);
    const hash = await db.query<{ ok: boolean }>(`select nda_text_hash = md5($2) as ok from public.deal_room_members where room_id = $1 and user_id = $3`, [room, NDA, MEM]);
    expect(hash.rows[0]!.ok).toBe(true);
    expect(await q(OUT, `select * from public.deal_room_members where room_id = $1`, [room])).toHaveLength(0);
  });

  it("lets writers upload into their own folder only; viewers can't upload", async () => {
    const path = `${room}/${MEM}/11111111-1111-4111-8111-111111111111.pdf`;
    await upload(MEM, path, 2048);
    await expect(upload(MEM, `${room}/${OWN}/22222222-2222-4222-8222-222222222222.pdf`)).rejects.toThrow(/row-level security/);
    await expect(upload(VEW, `${room}/${VEW}/33333333-3333-4333-8333-333333333333.pdf`)).rejects.toThrow(/row-level security/);
    await expect(upload(OUT, `${room}/${OUT}/44444444-4444-4444-8444-444444444444.pdf`)).rejects.toThrow(/row-level security/);
    await expect(q(MEM, `select public.add_deal_room_document($1, $2, 'Term sheet.pdf', 'application/pdf', 999)`, [room, path])).rejects.toThrow(
      /size does not match/,
    );
    const r = await q<{ id: string }>(MEM, `select public.add_deal_room_document($1, $2, 'Term sheet.pdf', 'application/pdf', 2048) as id`, [room, path]);
    doc = r[0]!.id;
    const path2 = `${room}/${MEM}/55555555-5555-4555-8555-555555555555.pdf`;
    await upload(MEM, path2, 3000);
    await q(MEM, `select public.add_deal_room_document($1, $2, 'term sheet.PDF', 'application/pdf', 3000)`, [room, path2]);
    const versions = await q<{ version: number }>(OWN, `select version from public.deal_room_documents where room_id = $1 order by version`, [room]);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    const notified = await db.query<{ n: number }>(`select count(*)::int as n from public.notifications where type = 'deal_room_document' and user_id = $1`, [OWN]);
    expect(notified.rows[0]!.n).toBe(2);
  });

  it("files can only be read after a logged open; the log is owner/admin only and append-only", async () => {
    const path = `${room}/${MEM}/11111111-1111-4111-8111-111111111111.pdf`;
    expect(await q(VEW, `select name from storage.objects where name = $1`, [path])).toHaveLength(0);
    const opened = await q<{ storage_path: string }>(VEW, `select * from public.open_deal_room_document($1, 'download')`, [doc]);
    expect(opened[0]!.storage_path).toBe(path);
    expect(await q(VEW, `select name from storage.objects where name = $1`, [path])).toHaveLength(1);
    await expect(q(OUT, `select * from public.open_deal_room_document($1, 'view')`, [doc])).rejects.toThrow(/not found/);

    expect(await q(VEW, `select * from public.deal_room_access_log where room_id = $1`, [room])).toHaveLength(0);
    expect(await q(MEM, `select * from public.deal_room_access_log where room_id = $1`, [room])).toHaveLength(0);
    const log = await q<{ user_id: string; action: string }>(ADM, `select user_id, action from public.deal_room_access_log where room_id = $1`, [room]);
    expect(log).toEqual([{ user_id: VEW, action: "download" }]);
    await expect(q(OWN, `insert into public.deal_room_access_log (room_id, document_id, user_id, action) values ($1, $2, $3, 'view')`, [room, doc, OWN])).rejects.toThrow(
      /permission denied/,
    );
    await expect(q(OWN, `delete from public.deal_room_access_log`)).rejects.toThrow(/permission denied/);
    await expect(db.query(`update public.deal_room_access_log set action = 'view'`)).rejects.toThrow(/cannot be changed/);
  });

  it("discussion: members post, viewers and outsiders can't", async () => {
    await q(MEM, `insert into public.deal_room_messages (room_id, body) values ($1, 'Updated model attached')`, [room]);
    await expect(q(VEW, `insert into public.deal_room_messages (room_id, body) values ($1, 'hi')`, [room])).rejects.toThrow(/row-level security/);
    await expect(q(OUT, `insert into public.deal_room_messages (room_id, body) values ($1, 'hi')`, [room])).rejects.toThrow(/row-level security/);
    await expect(q(MEM, `insert into public.deal_room_messages (room_id, author_id, body) values ($1, $2, 'spoof')`, [room, OWN])).rejects.toThrow(
      /permission denied/,
    );
    expect(await q(VEW, `select body from public.deal_room_messages where room_id = $1`, [room])).toHaveLength(1);
    expect(await q(OUT, `select body from public.deal_room_messages where room_id = $1`, [room])).toHaveLength(0);
  });

  it("changing the NDA locks everyone but the owner out until they re-accept", async () => {
    await q(OWN, `select public.update_deal_room($1, 'Project Atlas', 'Series B', true, $2)`, [room, `${NDA} Including the data room index.`]);
    expect(await q(MEM, `select id from public.deal_rooms where id = $1`, [room])).toHaveLength(0);
    expect(await q(MEM, `select id from public.deal_room_messages where room_id = $1`, [room])).toHaveLength(0);
    expect(await q(MEM, `select id from public.deal_room_documents where room_id = $1`, [room])).toHaveLength(0);
    expect(await q(OWN, `select id from public.deal_room_documents where room_id = $1`, [room])).toHaveLength(2);
    const inv = await q<{ rejoin: boolean; nda_version: number }>(MEM, `select rejoin, nda_version from public.deal_room_invitations()`);
    expect(inv).toEqual([{ rejoin: true, nda_version: 2 }]);
    for (const u of [ADM, MEM, VEW]) await q(u, `select public.join_deal_room($1, 2)`, [room]);
    expect(await q(MEM, `select id from public.deal_room_documents where room_id = $1`, [room])).toHaveLength(2);
  });

  it("removal revokes access immediately; admins can't remove admins or the owner", async () => {
    await expect(q(ADM, `select public.remove_deal_room_member($1, $2)`, [room, OWN])).rejects.toThrow(/owner cannot be removed/);
    await q(ADM, `select public.remove_deal_room_member($1, $2)`, [room, VEW]);
    expect(await q(VEW, `select id from public.deal_rooms where id = $1`, [room])).toHaveLength(0);
    await expect(q(VEW, `select * from public.open_deal_room_document($1, 'view')`, [doc])).rejects.toThrow(/not found/);
    const path = `${room}/${MEM}/11111111-1111-4111-8111-111111111111.pdf`;
    expect(await q(VEW, `select name from storage.objects where name = $1`, [path])).toHaveLength(0);
    await expect(q(OWN, `select public.leave_deal_room($1)`, [room])).rejects.toThrow(/owner cannot leave/);
  });

  it("closed rooms are read-only", async () => {
    await expect(q(ADM, `select public.set_deal_room_status($1, 'closed')`, [room])).rejects.toThrow(/Only the owner/);
    await q(OWN, `select public.set_deal_room_status($1, 'closed')`, [room]);
    await expect(q(MEM, `insert into public.deal_room_messages (room_id, body) values ($1, 'late')`, [room])).rejects.toThrow(/row-level security/);
    await expect(upload(MEM, `${room}/${MEM}/66666666-6666-4666-8666-666666666666.pdf`)).rejects.toThrow(/row-level security/);
    await expect(q(OWN, `select public.invite_to_deal_room($1, $2, 'member')`, [room, VEW])).rejects.toThrow(/closed/);
    expect(await q(MEM, `select id from public.deal_room_documents where room_id = $1`, [room])).toHaveLength(2);
  });
});

describe("relationship manager", () => {
  it("notes are only allowed for connections or people you've messaged", async () => {
    await q(OWN, `insert into public.contact_notes (contact_id, body, tags, stage) values ($1, 'Met at Davos', array[' Investor ', 'investor', 'LP'], 'warm')`, [MEM]);
    const row = await q<{ tags: string[]; owner_id: string }>(OWN, `select tags, owner_id from public.contact_notes where contact_id = $1`, [MEM]);
    expect(row).toEqual([{ tags: ["investor", "lp"], owner_id: OWN }]);
    await expect(q(OWN, `insert into public.contact_notes (contact_id, body) values ($1, 'x')`, [OUT])).rejects.toThrow(/row-level security/);
    await expect(q(OWN, `insert into public.contact_notes (contact_id, body) values ($1, 'self')`, [OWN])).rejects.toThrow(/row-level security/);

    // A shared conversation also counts.
    const conv = await db.query<{ id: string }>(`insert into public.conversations default values returning id`);
    await db.query(`insert into public.conversation_participants (conversation_id, user_id) values ($1, $2), ($1, $3)`, [conv.rows[0]!.id, OWN, OUT]);
    await q(OWN, `insert into public.contact_notes (contact_id, body) values ($1, 'Messaged about the villa')`, [OUT]);
  });

  it("notes and reminders are invisible to the contact and everyone else", async () => {
    await q(OWN, `insert into public.contact_reminders (contact_id, due_on, body) values ($1, current_date, 'Send the deck')`, [MEM]);
    for (const u of [MEM, ADM, OUT]) {
      expect(await q(u, `select * from public.contact_notes`)).toHaveLength(0);
      expect(await q(u, `select * from public.contact_reminders`)).toHaveLength(0);
    }
    expect(await q(null, `select 1 from public.contact_notes`).catch(() => [])).toHaveLength(0);
    const upd = await q(MEM, `update public.contact_notes set body = 'hacked' where owner_id = $1 returning 1`, [OWN]);
    expect(upd).toHaveLength(0);
    await expect(q(MEM, `insert into public.contact_notes (owner_id, contact_id, body) values ($1, $2, 'spoof')`, [OWN, ADM])).rejects.toThrow(
      /permission denied/,
    );
    const due = await q(OWN, `select body from public.contact_reminders where due_on <= current_date and done_at is null`);
    expect(due).toEqual([{ body: "Send the deck" }]);
  });
});
