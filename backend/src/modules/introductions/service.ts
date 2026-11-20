import "server-only";
import { z } from "zod";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";

/*
 * Introduction requests through a mutual connection. Every rule (who may ask whom, who sees
 * what, rate limits, connecting on acceptance) is enforced in SQL functions — see migration
 * 20261118000300. This module only shapes the data for the UI.
 */

export const requestIntroductionSchema = z.object({
  introducerId: z.uuid(),
  targetId: z.uuid(),
  message: z
    .string()
    .trim()
    .min(20, { error: "Say a little about why you'd like to meet (20+ characters)." })
    .max(600),
});

export const respondIntroductionSchema = z.discriminatedUnion("as", [
  z.object({ as: z.literal("introducer"), accept: z.boolean(), note: z.string().trim().max(400).optional() }),
  z.object({ as: z.literal("target"), accept: z.boolean() }),
]);

/**
 * What the viewer may know about an introduction (see my_introductions() in
 * 20261124000200). Requesters never learn who declined: any decline or expiry is "unavailable".
 */
export type IntroductionStatus = "pending" | "forwarded" | "accepted" | "declined" | "withdrawn" | "expired" | "unavailable";

export type IntroductionView = {
  id: string;
  status: IntroductionStatus;
  message: string;
  /** The introducer's note to the target. Never shown to the requester. */
  introducerNote: string | null;
  /** The 1:1 conversation opened on mutual acceptance (requester and target only). */
  conversationId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  requester: ProfileSummary;
  introducer: ProfileSummary;
  target: ProfileSummary;
  /** Vouches for the requester that the viewer can see, to help introducer and target decide. */
  requesterVouches: number;
  /** The viewer's role in this request. */
  role: "requester" | "introducer" | "target";
};

export type IntroductionInbox = {
  /** Requests waiting for the viewer to vouch for (as introducer). */
  toReview: IntroductionView[];
  /** Introductions forwarded to the viewer (as target). */
  received: IntroductionView[];
  /** Requests the viewer has made. */
  sent: IntroductionView[];
};

type MyIntroductionRow = {
  id: string;
  role: IntroductionView["role"];
  status: IntroductionStatus;
  requester_id: string;
  introducer_id: string;
  target_id: string;
  message: string;
  introducer_note: string | null;
  conversation_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

async function myIntroductions(db: DbClient): Promise<MyIntroductionRow[]> {
  return unwrap(await db.rpc("my_introductions")) as MyIntroductionRow[];
}

export async function listIntroductions(db: DbClient): Promise<IntroductionInbox> {
  const rows = await myIntroductions(db);
  const requesterIds = [...new Set(rows.filter((r) => r.role !== "requester").map((r) => r.requester_id))];
  const [people, vouchRows] = await Promise.all([
    getSummaries(db, rows.flatMap((r) => [r.requester_id, r.introducer_id, r.target_id])),
    requesterIds.length
      ? db.from("vouches").select("vouchee_id").in("vouchee_id", requesterIds).is("withdrawn_at", null)
      : Promise.resolve({ data: [] as { vouchee_id: string }[], error: null }),
  ]);
  // RLS returns only the vouches this viewer may see, so the count never leaks hidden ones.
  const vouchCounts = new Map<string, number>();
  for (const v of unwrap(vouchRows)) vouchCounts.set(v.vouchee_id, (vouchCounts.get(v.vouchee_id) ?? 0) + 1);

  const views: IntroductionView[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    introducerNote: r.introducer_note,
    conversationId: r.conversation_id,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    requester: people.get(r.requester_id)!,
    introducer: people.get(r.introducer_id)!,
    target: people.get(r.target_id)!,
    requesterVouches: vouchCounts.get(r.requester_id) ?? 0,
    role: r.role,
  }));
  return {
    toReview: views.filter((v) => v.role === "introducer"),
    received: views.filter((v) => v.role === "target"),
    sent: views.filter((v) => v.role === "requester"),
  };
}

/** Requests waiting on the viewer: to forward (as introducer) or to answer (as target). */
export async function countIntroductionsAwaiting(db: DbClient): Promise<number> {
  const rows = await myIntroductions(db);
  return rows.filter((r) => (r.role === "introducer" && r.status === "pending") || (r.role === "target" && r.status === "forwarded")).length;
}

/** Mutual connections who could introduce the viewer to `targetId` (only the viewer's own connections). */
export async function introductionPaths(db: DbClient, targetId: string): Promise<ProfileSummary[]> {
  const ids = unwrap(await db.rpc("introduction_paths", { p_target: targetId })) as unknown as string[];
  if (!ids || ids.length === 0) return [];
  const people = await getSummaries(db, ids);
  return ids.map((id) => people.get(id)!).filter((p) => p.handle);
}

export async function requestIntroduction(db: DbClient, input: z.infer<typeof requestIntroductionSchema>): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("request_introduction", { p_introducer: input.introducerId, p_target: input.targetId, p_message: input.message }));
  return { id: id as string };
}

export async function respondToIntroduction(db: DbClient, id: string, input: z.infer<typeof respondIntroductionSchema>) {
  if (input.as === "introducer") {
    unwrap(await db.rpc("respond_introduction_as_introducer", { p_id: id, p_forward: input.accept, p_note: input.note ?? null }));
  } else {
    unwrap(await db.rpc("respond_introduction_as_target", { p_id: id, p_accept: input.accept }));
  }
}

export async function withdrawIntroduction(db: DbClient, id: string) {
  unwrap(await db.rpc("withdraw_introduction", { p_id: id }));
}
