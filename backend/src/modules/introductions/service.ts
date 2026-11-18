import "server-only";
import { z } from "zod";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
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

export type IntroductionStatus = "pending" | "forwarded" | "accepted" | "declined" | "withdrawn";

export type IntroductionView = {
  id: string;
  status: IntroductionStatus;
  message: string;
  introducerNote: string | null;
  declinedByIntroducer: boolean;
  createdAt: string;
  updatedAt: string;
  requester: ProfileSummary;
  introducer: ProfileSummary;
  target: ProfileSummary;
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

export async function listIntroductions(db: DbClient, viewer: Viewer): Promise<IntroductionInbox> {
  const rows = unwrap(
    await db
      .from("introduction_requests")
      .select("id, requester_id, introducer_id, target_id, message, introducer_note, status, declined_by, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100),
  );
  const people = await getSummaries(db, rows.flatMap((r) => [r.requester_id, r.introducer_id, r.target_id]));
  const views: IntroductionView[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    message: r.message,
    introducerNote: r.introducer_note,
    declinedByIntroducer: r.declined_by !== null && r.declined_by === r.introducer_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    requester: people.get(r.requester_id)!,
    introducer: people.get(r.introducer_id)!,
    target: people.get(r.target_id)!,
    role: r.requester_id === viewer.id ? "requester" : r.introducer_id === viewer.id ? "introducer" : "target",
  }));
  return {
    toReview: views.filter((v) => v.role === "introducer"),
    received: views.filter((v) => v.role === "target"),
    sent: views.filter((v) => v.role === "requester"),
  };
}

export async function countIntroductionsAwaiting(db: DbClient, viewer: Viewer): Promise<number> {
  const [asIntroducer, asTarget] = await Promise.all([
    db.from("introduction_requests").select("id", { count: "exact", head: true }).eq("introducer_id", viewer.id).eq("status", "pending"),
    db.from("introduction_requests").select("id", { count: "exact", head: true }).eq("target_id", viewer.id).eq("status", "forwarded"),
  ]);
  return (asIntroducer.count ?? 0) + (asTarget.count ?? 0);
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
