import "server-only";
import { z } from "zod";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { CONTACT_STAGES, type ContactStage } from "./constants";

/*
 * Relationship manager. Notes and reminders are private to their owner — enforced by RLS in
 * migration 20261125000200 (the contact and staff can never read them). Notes can only be created
 * for connections or people the owner shares a conversation with.
 */

const isoDate = z.iso.date({ error: "Use a valid date" });

export const contactNoteSchema = z.object({
  body: z.string().max(5000).default(""),
  tags: z
    .array(z.string().trim().min(1).max(32, { error: "Tags can be up to 32 characters" }))
    .max(10, { error: "Use up to 10 tags" })
    .default([]),
  stage: z.enum(CONTACT_STAGES).default("none"),
  lastContactedOn: isoDate.nullable().optional(),
});

export const reminderCreateSchema = z.object({
  dueOn: isoDate,
  body: z.string().trim().min(1, { error: "What should you follow up on?" }).max(300),
});

export const reminderUpdateSchema = z.object({
  done: z.boolean().optional(),
  dueOn: isoDate.optional(),
  body: z.string().trim().min(1).max(300).optional(),
});

export type ContactNote = {
  body: string;
  tags: string[];
  stage: ContactStage;
  lastContactedOn: string | null;
  updatedAt: string;
};

export type ContactReminder = { id: string; contactId: string; dueOn: string; body: string; doneAt: string | null };

export type ContactRow = {
  person: ProfileSummary;
  note: ContactNote | null;
  reminders: ContactReminder[];
  /** Earliest open reminder that is due today or earlier. */
  dueOn: string | null;
};

type NoteRow = { contact_id: string; body: string; tags: string[]; stage: ContactStage; last_contacted_on: string | null; updated_at: string };
type ReminderRow = { id: string; contact_id: string; due_on: string; body: string; done_at: string | null };

const toNote = (r: NoteRow): ContactNote => ({
  body: r.body,
  tags: r.tags,
  stage: r.stage,
  lastContactedOn: r.last_contacted_on,
  updatedAt: r.updated_at,
});
const toReminder = (r: ReminderRow): ContactReminder => ({ id: r.id, contactId: r.contact_id, dueOn: r.due_on, body: r.body, doneAt: r.done_at });

/** Today as YYYY-MM-DD in UTC (the same day boundary the database uses). */
export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function summariesFor(db: DbClient, ids: string[]): Promise<Map<string, ProfileSummary>> {
  const out = new Map<string, ProfileSummary>();
  for (let i = 0; i < ids.length; i += 200) {
    for (const [k, v] of await getSummaries(db, ids.slice(i, i + 200))) out.set(k, v);
  }
  return out;
}

/**
 * Sort: contacts with due reminders first (earliest first), then most recently contacted, then
 * by name.
 */
export function sortContacts(rows: ContactRow[]): ContactRow[] {
  return [...rows].sort((a, b) => {
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    const la = a.note?.lastContactedOn ?? "";
    const lb = b.note?.lastContactedOn ?? "";
    if (la !== lb) return lb.localeCompare(la);
    return a.person.displayName.localeCompare(b.person.displayName);
  });
}

export function filterContacts(rows: ContactRow[], f: { q?: string; stage?: string; tag?: string; due?: boolean }): ContactRow[] {
  const q = f.q?.trim().toLowerCase();
  const tag = f.tag?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.due && !r.dueOn) return false;
    if (f.stage && (r.note?.stage ?? "none") !== f.stage) return false;
    if (tag && !r.note?.tags.includes(tag)) return false;
    if (q) {
      const hay = [r.person.displayName, r.person.handle, r.person.headline ?? "", r.note?.body ?? "", ...(r.note?.tags ?? [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** All accepted connections plus anyone the viewer has notes on, with notes and open reminders. */
export async function listContacts(db: DbClient, viewer: Viewer, now = new Date()): Promise<ContactRow[]> {
  const [connections, notes, reminders] = await Promise.all([
    db.from("connections").select("requester_id, addressee_id").eq("status", "accepted").limit(1000),
    db.from("contact_notes").select("contact_id, body, tags, stage, last_contacted_on, updated_at").limit(1000),
    db.from("contact_reminders").select("id, contact_id, due_on, body, done_at").is("done_at", null).order("due_on").limit(500),
  ]);
  const noteMap = new Map(unwrap(notes).map((n) => [n.contact_id, toNote(n as NoteRow)]));
  const reminderMap = new Map<string, ContactReminder[]>();
  for (const r of unwrap(reminders)) {
    const list = reminderMap.get(r.contact_id) ?? [];
    list.push(toReminder(r));
    reminderMap.set(r.contact_id, list);
  }
  const ids = new Set(unwrap(connections).map((c) => (c.requester_id === viewer.id ? c.addressee_id : c.requester_id)));
  for (const id of noteMap.keys()) ids.add(id);
  for (const id of reminderMap.keys()) ids.add(id);
  const people = await summariesFor(db, [...ids]);
  const day = today(now);
  return sortContacts(
    [...ids].map((id) => {
      const rs = reminderMap.get(id) ?? [];
      const due = rs.find((r) => r.dueOn <= day);
      return { person: people.get(id)!, note: noteMap.get(id) ?? null, reminders: rs, dueOn: due?.dueOn ?? null };
    }),
  );
}

/** The viewer's private note and reminders about one member (empty for anyone else). */
export async function getContact(db: DbClient, contactId: string): Promise<{ note: ContactNote | null; reminders: ContactReminder[]; allowed: boolean }> {
  const [note, reminders, allowed] = await Promise.all([
    db.from("contact_notes").select("contact_id, body, tags, stage, last_contacted_on, updated_at").eq("contact_id", contactId).maybeSingle(),
    db.from("contact_reminders").select("id, contact_id, due_on, body, done_at").eq("contact_id", contactId).is("done_at", null).order("due_on"),
    db.rpc("crm_contact_allowed", { p_contact: contactId }),
  ]);
  const n = unwrap(note);
  return { note: n ? toNote(n as NoteRow) : null, reminders: unwrap(reminders).map(toReminder), allowed: Boolean(unwrap(allowed)) };
}

const NOTE_COLUMNS = "contact_id, body, tags, stage, last_contacted_on, updated_at";

/**
 * Update-then-insert rather than upsert: only the editable columns are granted to members, and
 * owner_id always comes from auth.uid() (column default + RLS check).
 */
export async function saveContactNote(db: DbClient, contactId: string, input: z.infer<typeof contactNoteSchema>): Promise<ContactNote> {
  const fields = { body: input.body, tags: input.tags, stage: input.stage, last_contacted_on: input.lastContactedOn ?? null };
  const updated = unwrap(await db.from("contact_notes").update(fields).eq("contact_id", contactId).select(NOTE_COLUMNS));
  if (updated[0]) return toNote(updated[0] as NoteRow);
  const inserted = await db.from("contact_notes").insert({ contact_id: contactId, ...fields }).select(NOTE_COLUMNS).single();
  if (inserted.error?.code === "23505") return saveContactNote(db, contactId, input); // created concurrently
  return toNote(unwrap(inserted) as NoteRow);
}

export async function deleteContactNote(db: DbClient, contactId: string) {
  unwrap(await db.from("contact_notes").delete().eq("contact_id", contactId));
}

export async function addReminder(db: DbClient, contactId: string, input: z.infer<typeof reminderCreateSchema>): Promise<ContactReminder> {
  const row = unwrap(
    await db
      .from("contact_reminders")
      .insert({ contact_id: contactId, due_on: input.dueOn, body: input.body })
      .select("id, contact_id, due_on, body, done_at")
      .single(),
  );
  return toReminder(row);
}

export async function updateReminder(db: DbClient, reminderId: string, input: z.infer<typeof reminderUpdateSchema>) {
  const patch: { done_at?: string | null; due_on?: string; body?: string } = {};
  if (input.done !== undefined) patch.done_at = input.done ? new Date().toISOString() : null;
  if (input.dueOn) patch.due_on = input.dueOn;
  if (input.body) patch.body = input.body;
  unwrap(await db.from("contact_reminders").update(patch).eq("id", reminderId).select("id").single());
}

export async function deleteReminder(db: DbClient, reminderId: string) {
  unwrap(await db.from("contact_reminders").delete().eq("id", reminderId));
}

/** Open reminders due today or earlier, for the home rail. */
export async function dueReminders(db: DbClient, limit = 5, now = new Date()): Promise<(ContactReminder & { person: ProfileSummary })[]> {
  const rows = unwrap(
    await db
      .from("contact_reminders")
      .select("id, contact_id, due_on, body, done_at")
      .is("done_at", null)
      .lte("due_on", today(now))
      .order("due_on")
      .limit(limit),
  );
  const people = await getSummaries(
    db,
    rows.map((r) => r.contact_id),
  );
  return rows.map((r) => ({ ...toReminder(r), person: people.get(r.contact_id)! }));
}
