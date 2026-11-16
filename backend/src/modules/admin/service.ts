import "server-only";
import type { z } from "zod";
import type { DbClient } from "@backend/db/server";
import { toCampaignView, type CampaignView } from "@backend/modules/ads/service";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { signedUrls } from "@backend/modules/storage/service";
import { unwrap } from "@backend/http/db-errors";
import { AppError } from "@/lib/errors";
import type { moderationSchema, planGrantSchema } from "./schemas";

/*
 * All staff operations run as the signed-in staff member (not the service role). The SQL
 * functions re-check staff rank with is_staff() and write the audit log, so these endpoints
 * remain safe even if a route-level check were missed.
 */

const QUEUE_LIMIT = 50;

export type QueueCounts = {
  applications: number;
  verifications: number;
  businesses: number;
  listings: number;
  campaigns: number;
  reports: number;
};

export async function queueCounts(db: DbClient): Promise<QueueCounts> {
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [applications, verifications, businesses, listings, campaigns, reports] = await Promise.all([
    count(db.from("membership_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"])),
    count(db.from("verifications").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(db.from("businesses").select("id", { count: "exact", head: true }).eq("status", "pending_review")),
    count(db.from("listings").select("id", { count: "exact", head: true }).eq("status", "pending_review")),
    count(db.from("ad_campaigns").select("id", { count: "exact", head: true }).eq("status", "pending_review")),
    count(db.from("reports").select("id", { count: "exact", head: true }).in("status", ["open", "reviewing"])),
  ]);
  return { applications, verifications, businesses, listings, campaigns, reports };
}

export type ApplicationQueueItem = { id: string; planId: string; status: string; statement: string | null; createdAt: string; applicant: ProfileSummary };

export async function applicationQueue(db: DbClient): Promise<ApplicationQueueItem[]> {
  const rows = unwrap(
    await db
      .from("membership_applications")
      .select("id, user_id, plan_id, status, statement, created_at")
      .in("status", ["submitted", "under_review"])
      .order("created_at")
      .limit(QUEUE_LIMIT),
  );
  const people = await getSummaries(db, rows.map((r) => r.user_id));
  return rows.map((r) => ({ id: r.id, planId: r.plan_id, status: r.status, statement: r.statement, createdAt: r.created_at, applicant: people.get(r.user_id)! }));
}

export type VerificationQueueItem = {
  id: string;
  kind: string;
  statement: string | null;
  createdAt: string;
  subject: ProfileSummary;
  documents: { path: string; url: string | null }[];
};

export async function verificationQueue(db: DbClient): Promise<VerificationQueueItem[]> {
  const rows = unwrap(
    await db.from("verifications").select("id, user_id, kind, statement, evidence_paths, created_at").eq("status", "pending").order("created_at").limit(QUEUE_LIMIT),
  );
  const people = await getSummaries(db, rows.map((r) => r.user_id));
  // Short-lived signed URLs; storage RLS allows moderators to read verification documents.
  const urls = await signedUrls(db, "verification-documents", rows.flatMap((r) => r.evidence_paths), 600);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    statement: r.statement,
    createdAt: r.created_at,
    subject: people.get(r.user_id)!,
    documents: r.evidence_paths.map((p) => ({ path: p, url: urls.get(p) ?? null })),
  }));
}

export async function businessQueue(db: DbClient) {
  const rows = unwrap(
    await db.from("businesses").select("*").eq("status", "pending_review").order("updated_at").limit(QUEUE_LIMIT),
  );
  const owners = await getSummaries(db, rows.map((r) => r.owner_id));
  const urls = await signedUrls(db, "verification-documents", rows.flatMap((r) => r.evidence_paths), 600);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    location: r.location,
    website: r.website,
    registrationNumber: r.registration_number,
    description: r.description,
    owner: owners.get(r.owner_id)!,
    documents: r.evidence_paths.map((p) => ({ path: p, url: urls.get(p) ?? null })),
  }));
}

export async function listingQueue(db: DbClient) {
  const rows = unwrap(
    await db
      .from("listings")
      .select("id, title, slug, category, summary, city, country, business_id, updated_at")
      .eq("status", "pending_review")
      .order("updated_at")
      .limit(QUEUE_LIMIT),
  );
  const businesses = rows.length ? unwrap(await db.from("businesses").select("id, name").in("id", rows.map((r) => r.business_id))) : [];
  const names = new Map(businesses.map((b) => [b.id, b.name]));
  return rows.map((r) => ({ ...r, businessName: names.get(r.business_id) ?? "Unknown business" }));
}

export async function campaignQueue(db: DbClient): Promise<(CampaignView & { owner: ProfileSummary })[]> {
  const rows = unwrap(await db.from("ad_campaigns").select("*").eq("status", "pending_review").order("submitted_at").limit(QUEUE_LIMIT));
  const owners = await getSummaries(db, rows.map((r) => r.owner_id));
  return rows.map((r) => ({ ...toCampaignView(r), owner: owners.get(r.owner_id)! }));
}

export async function reportQueue(db: DbClient) {
  const rows = unwrap(
    await db.from("reports").select("*").in("status", ["open", "reviewing"]).order("created_at").limit(QUEUE_LIMIT),
  );
  const reporters = await getSummaries(db, rows.map((r) => r.reporter_id));
  const postIds = rows.filter((r) => r.target_type === "post").map((r) => r.target_id);
  const posts = postIds.length ? unwrap(await db.from("posts").select("id, author_id, body, status").in("id", postIds)) : [];
  const postMap = new Map(posts.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    details: r.details,
    createdAt: r.created_at,
    reporter: reporters.get(r.reporter_id)!,
    post: postMap.get(r.target_id) ?? null,
  }));
}

export async function auditLog(db: DbClient, limit = 100) {
  const rows = unwrap(await db.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit));
  const actors = await getSummaries(db, rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x)));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    createdAt: r.created_at,
    actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null,
  }));
}

export async function decideApplication(db: DbClient, id: string, status: "under_review" | "approved" | "rejected", note?: string) {
  unwrap(await db.rpc("decide_application", { p_id: id, p_status: status, p_notes: note }));
}

export async function decideVerification(db: DbClient, id: string, status: "approved" | "rejected" | "revoked", note?: string) {
  unwrap(await db.rpc("decide_verification", { p_id: id, p_status: status, p_notes: note }));
}

export async function reviewBusiness(db: DbClient, id: string, status: "approved" | "rejected" | "suspended", note?: string) {
  unwrap(await db.rpc("review_business", { p_id: id, p_status: status, p_note: note }));
}

export async function reviewListing(db: DbClient, id: string, approve: boolean, note?: string) {
  unwrap(await db.rpc("review_listing", { p_id: id, p_approve: approve, p_note: note }));
}

export async function moderate(db: DbClient, input: z.infer<typeof moderationSchema>) {
  return unwrap(
    await db.rpc("moderate", {
      p_action: input.action,
      p_reason: input.reason,
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_target_user: input.targetUserId,
      p_report_id: input.reportId,
    }),
  );
}

export async function dismissReport(db: DbClient, id: string, note?: string) {
  unwrap(await db.rpc("dismiss_report", { p_id: id, p_note: note }));
}

export type PlanGrantItem = {
  id: string;
  planId: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  member: ProfileSummary;
  grantedBy: ProfileSummary | null;
};

/** Active grants first, then the most recent ended/revoked ones. */
export async function listPlanGrants(db: DbClient, limit = QUEUE_LIMIT): Promise<PlanGrantItem[]> {
  const rows = unwrap(
    await db
      .from("plan_grants")
      .select("id, user_id, plan_id, reason, granted_by, created_at, expires_at, revoked_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  const people = await getSummaries(db, rows.flatMap((r) => [r.user_id, ...(r.granted_by ? [r.granted_by] : [])]));
  const now = Date.now();
  const isActive = (r: (typeof rows)[number]) => !r.revoked_at && new Date(r.expires_at).getTime() > now;
  return rows
    .filter((r) => people.has(r.user_id))
    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)))
    .map((r) => ({
      id: r.id,
      planId: r.plan_id,
      reason: r.reason,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      active: isActive(r),
      member: people.get(r.user_id)!,
      grantedBy: r.granted_by ? (people.get(r.granted_by) ?? null) : null,
    }));
}

export async function grantPlan(db: DbClient, input: z.infer<typeof planGrantSchema>): Promise<{ id: string }> {
  const member = unwrap(await db.from("profiles").select("id").eq("handle", input.handle).maybeSingle());
  if (!member) throw new AppError("not_found", `No member with the handle @${input.handle}.`, { handle: ["Member not found"] });
  const id = unwrap(await db.rpc("grant_plan", { p_user: member.id, p_plan_id: input.planId, p_days: input.days, p_reason: input.reason }));
  return { id };
}

export async function revokePlanGrant(db: DbClient, id: string, reason?: string) {
  unwrap(await db.rpc("revoke_plan_grant", { p_id: id, p_reason: reason }));
}
