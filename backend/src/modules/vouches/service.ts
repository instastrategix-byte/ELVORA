import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { VOUCH_NOTE_MAX, VOUCH_RELATIONSHIPS, type VouchRelationship } from "./constants";

/*
 * Vouching. Every rule — who may vouch for whom, the monthly cap, silent declines, who sees
 * which vouch — is enforced in SQL (20261124000100_vouches.sql). This module shapes data for
 * the UI and resolves handles.
 */

const note = z.string().trim().max(VOUCH_NOTE_MAX, { error: `Keep it under ${VOUCH_NOTE_MAX} characters` }).optional();
const handle = z
  .string()
  .trim()
  .toLowerCase()
  .transform((h) => h.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9_]{3,30}$/, { error: "Enter a member's handle" }));

export const vouchSchema = z.object({ voucheeId: z.uuid(), relationship: z.enum(VOUCH_RELATIONSHIPS), note });
export const vouchRequestSchema = z.object({
  voucherId: z.uuid(),
  message: z.string().trim().max(400).optional(),
});
export const refereeSchema = z.object({ handle, message: z.string().trim().max(400).optional() });
export const respondVouchRequestSchema = z.discriminatedUnion("accept", [
  z.object({ accept: z.literal(true), relationship: z.enum(VOUCH_RELATIONSHIPS), note }),
  z.object({ accept: z.literal(false) }),
]);
export const hideVouchSchema = z.object({ hidden: z.boolean() });

export type VouchView = {
  id: string;
  voucher: ProfileSummary;
  relationship: VouchRelationship;
  note: string | null;
  createdAt: string;
};

export type ProfileVouches = { total: number; items: VouchView[] };

/** Vouches on a member's profile that the viewer may see (RLS filters hidden, blocked, private). */
export async function listProfileVouches(db: DbClient, profileId: string): Promise<ProfileVouches> {
  const rows = unwrap(
    await db
      .from("vouches")
      .select("id, voucher_id, relationship, note, created_at")
      .eq("vouchee_id", profileId)
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  const people = await getSummaries(
    db,
    rows.map((r) => r.voucher_id),
  );
  const items = rows
    .map((r) => ({ id: r.id, voucher: people.get(r.voucher_id)!, relationship: r.relationship, note: r.note, createdAt: r.created_at }))
    // A voucher whose profile the viewer can't load is shown as nothing rather than "private member".
    .filter((v) => v.voucher.handle);
  return { total: items.length, items };
}

/** Whether the viewer currently vouches for this member (for the profile button). */
export async function myVouchFor(db: DbClient, viewer: Viewer, profileId: string): Promise<{ id: string } | null> {
  const row = unwrap(
    await db
      .from("vouches")
      .select("id")
      .eq("voucher_id", viewer.id)
      .eq("vouchee_id", profileId)
      .is("withdrawn_at", null)
      .maybeSingle(),
  );
  return row ? { id: row.id } : null;
}

export type IncomingVouchRequest = {
  id: string;
  requester: ProfileSummary;
  message: string | null;
  forApplication: boolean;
  createdAt: string;
};
export type SentVouchRequest = {
  id: string;
  voucher: ProfileSummary;
  applicationId: string | null;
  message: string | null;
  status: "pending" | "accepted" | "cancelled" | "expired";
  createdAt: string;
};
export type ReceivedVouch = VouchView & { hidden: boolean };
export type GivenVouch = { id: string; vouchee: ProfileSummary; relationship: VouchRelationship; note: string | null; createdAt: string };

export type VouchInbox = {
  incoming: IncomingVouchRequest[];
  sent: SentVouchRequest[];
  received: ReceivedVouch[];
  given: GivenVouch[];
  allowance: { used: number; cap: number };
};

export async function getVouchInbox(db: DbClient, viewer: Viewer): Promise<VouchInbox> {
  const [incoming, sent, received, given, allowance] = await Promise.all([
    db
      .from("vouch_requests")
      .select("id, requester_id, message, application_id, created_at")
      .eq("voucher_id", viewer.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100),
    db.rpc("my_sent_vouch_requests"),
    db.rpc("my_received_vouches"),
    db
      .from("vouches")
      .select("id, vouchee_id, relationship, note, created_at")
      .eq("voucher_id", viewer.id)
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    db.rpc("my_vouch_allowance"),
  ]);
  const inc = unwrap(incoming);
  const snt = unwrap(sent);
  const rec = unwrap(received);
  const giv = unwrap(given);
  const people = await getSummaries(db, [
    ...inc.map((r) => r.requester_id),
    ...snt.map((r) => r.voucher_id),
    ...rec.map((r) => r.voucher_id),
    ...giv.map((r) => r.vouchee_id),
  ]);
  const allow = unwrap(allowance)[0];
  return {
    incoming: inc.map((r) => ({
      id: r.id,
      requester: people.get(r.requester_id)!,
      message: r.message,
      forApplication: r.application_id !== null,
      createdAt: r.created_at,
    })),
    sent: snt.map((r) => ({
      id: r.id,
      voucher: people.get(r.voucher_id)!,
      applicationId: r.application_id,
      message: r.message,
      status: r.status as SentVouchRequest["status"],
      createdAt: r.created_at,
    })),
    received: rec.map((r) => ({
      id: r.id,
      voucher: people.get(r.voucher_id)!,
      relationship: r.relationship,
      note: r.note,
      hidden: r.hidden,
      createdAt: r.created_at,
    })),
    given: giv.map((r) => ({ id: r.id, vouchee: people.get(r.vouchee_id)!, relationship: r.relationship, note: r.note, createdAt: r.created_at })),
    allowance: { used: allow?.used ?? 0, cap: allow?.cap ?? 10 },
  };
}

/** Referees the viewer named on each of their applications (declines still read as pending). */
export async function myApplicationReferees(db: DbClient): Promise<Map<string, SentVouchRequest[]>> {
  const rows = unwrap(await db.rpc("my_sent_vouch_requests")).filter((r) => r.application_id !== null);
  const people = await getSummaries(
    db,
    rows.map((r) => r.voucher_id),
  );
  const map = new Map<string, SentVouchRequest[]>();
  for (const r of rows) {
    const list = map.get(r.application_id!) ?? [];
    list.push({
      id: r.id,
      voucher: people.get(r.voucher_id)!,
      applicationId: r.application_id,
      message: r.message,
      status: r.status as SentVouchRequest["status"],
      createdAt: r.created_at,
    });
    map.set(r.application_id!, list);
  }
  return map;
}

/** Vouch requests waiting on the viewer (for badges). */
export async function countVouchRequestsAwaiting(db: DbClient, viewer: Viewer): Promise<number> {
  const { count, error } = await db
    .from("vouch_requests")
    .select("id", { count: "exact", head: true })
    .eq("voucher_id", viewer.id)
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}

export async function vouchFor(db: DbClient, input: z.infer<typeof vouchSchema>): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("vouch_for", { p_vouchee: input.voucheeId, p_relationship: input.relationship, p_note: input.note || null }));
  return { id: id as string };
}

export async function withdrawVouch(db: DbClient, id: string) {
  unwrap(await db.rpc("withdraw_vouch", { p_id: id }));
}

export async function setVouchHidden(db: DbClient, id: string, hidden: boolean) {
  unwrap(await db.rpc("set_vouch_hidden", { p_id: id, p_hidden: hidden }));
}

export async function requestVouch(db: DbClient, input: z.infer<typeof vouchRequestSchema>): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("request_vouch", { p_voucher: input.voucherId, p_message: input.message || null, p_application: null }));
  return { id: id as string };
}

/** An applicant names an existing member (by handle) as a referee on their open application. */
export async function addApplicationReferee(db: DbClient, applicationId: string, input: z.infer<typeof refereeSchema>): Promise<{ id: string }> {
  const person = unwrap(await db.from("profiles").select("id").eq("handle", input.handle).maybeSingle());
  if (!person) throw new AppError("not_found", "No member with that handle.", { handle: ["No member with that handle"] });
  const id = unwrap(await db.rpc("request_vouch", { p_voucher: person.id, p_message: input.message || null, p_application: applicationId }));
  return { id: id as string };
}

export async function respondToVouchRequest(db: DbClient, id: string, input: z.infer<typeof respondVouchRequestSchema>) {
  if (input.accept) {
    unwrap(await db.rpc("respond_vouch_request", { p_id: id, p_accept: true, p_relationship: input.relationship, p_note: input.note || null }));
  } else {
    unwrap(await db.rpc("respond_vouch_request", { p_id: id, p_accept: false }));
  }
}

export async function cancelVouchRequest(db: DbClient, id: string) {
  unwrap(await db.rpc("cancel_vouch_request", { p_id: id }));
}

// ---------------------------------------------------------------------------------------------
// Staff: referees and vouches on membership applications (shown to reviewers only; they don't
// change any approval rule).
// ---------------------------------------------------------------------------------------------
export type ApplicationTrust = {
  referees: { id: string; person: ProfileSummary; status: string; createdAt: string }[];
  vouches: VouchView[];
};

export async function applicationTrust(
  db: DbClient,
  applications: { id: string; applicantId: string }[],
): Promise<Map<string, ApplicationTrust>> {
  const map = new Map<string, ApplicationTrust>();
  if (applications.length === 0) return map;
  const [refRows, vouchRows] = await Promise.all([
    db
      .from("vouch_requests")
      .select("id, voucher_id, application_id, status, created_at")
      .in(
        "application_id",
        applications.map((a) => a.id),
      )
      .order("created_at"),
    db
      .from("vouches")
      .select("id, voucher_id, vouchee_id, relationship, note, created_at")
      .in(
        "vouchee_id",
        applications.map((a) => a.applicantId),
      )
      .is("withdrawn_at", null)
      .order("created_at", { ascending: false }),
  ]);
  const refs = unwrap(refRows);
  const vouches = unwrap(vouchRows);
  const people = await getSummaries(db, [...refs.map((r) => r.voucher_id), ...vouches.map((v) => v.voucher_id)]);
  for (const a of applications) {
    map.set(a.id, {
      referees: refs
        .filter((r) => r.application_id === a.id)
        .map((r) => ({ id: r.id, person: people.get(r.voucher_id)!, status: r.status, createdAt: r.created_at })),
      vouches: vouches
        .filter((v) => v.vouchee_id === a.applicantId)
        .map((v) => ({ id: v.id, voucher: people.get(v.voucher_id)!, relationship: v.relationship, note: v.note, createdAt: v.created_at })),
    });
  }
  return map;
}
