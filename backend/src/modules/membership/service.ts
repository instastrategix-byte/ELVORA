import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { assertOwnedPath } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { applicationSchema, redeemInvitationSchema, verificationRequestSchema } from "./schemas";
import type { MembershipOverview, Plan } from "./types";

export async function listPlans(db: DbClient): Promise<Plan[]> {
  const [plans, prices] = await Promise.all([
    db.from("membership_plans").select("*").eq("active", true).order("sort_order"),
    db.from("plan_prices").select("*").eq("active", true).order("amount_minor"),
  ]);
  const priceRows = unwrap(prices);
  return unwrap(plans).map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    audience: p.audience,
    features: p.features,
    isFree: p.is_free,
    requiresApplication: p.requires_application,
    requiredVerifications: p.required_verifications,
    trialDays: p.trial_days,
    prices: priceRows
      .filter((r) => r.plan_id === p.id)
      .map((r) => ({
        id: r.id,
        currency: r.currency,
        interval: r.billing_interval,
        amountMinor: r.amount_minor,
        providers: [
          ...(r.stripe_price_id ? (["stripe"] as const) : []),
          ...(r.razorpay_plan_id ? (["razorpay"] as const) : []),
        ],
      })),
  }));
}

export async function getMembershipOverview(db: DbClient, viewer: Viewer): Promise<MembershipOverview> {
  const plans = await listPlans(db);
  const [apps, verifs, subs, grants, pays, deletion, ...eligibility] = await Promise.all([
    db.from("membership_applications").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20),
    db.from("verifications").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20),
    db.from("subscriptions").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20),
    db.from("plan_grants").select("id, plan_id, expires_at, revoked_at").eq("user_id", viewer.id).order("expires_at", { ascending: false }).limit(10),
    db.from("payments").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(24),
    db.from("account_deletion_requests").select("id").eq("user_id", viewer.id).in("status", ["pending", "processing"]).limit(1),
    ...plans.filter((p) => !p.isFree).map((p) => db.rpc("is_eligible_for_plan", { p_plan_id: p.id })),
  ]);
  const paidPlans = plans.filter((p) => !p.isFree);
  return {
    plans,
    applications: unwrap(apps).map((a) => ({
      id: a.id,
      planId: a.plan_id,
      status: a.status,
      statement: a.statement,
      reviewerNotes: a.status === "rejected" ? a.reviewer_notes : null,
      createdAt: a.created_at,
      decidedAt: a.decided_at,
    })),
    verifications: unwrap(verifs).map((v) => ({
      id: v.id,
      kind: v.kind,
      status: v.status,
      reviewerNotes: v.status === "rejected" ? v.reviewer_notes : null,
      createdAt: v.created_at,
      reviewedAt: v.reviewed_at,
    })),
    subscriptions: unwrap(subs).map((s) => ({
      id: s.id,
      planId: s.plan_id,
      provider: s.provider,
      status: s.status,
      currentPeriodEnd: s.current_period_end,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      createdAt: s.created_at,
    })),
    grants: unwrap(grants).map((g) => ({
      id: g.id,
      planId: g.plan_id,
      expiresAt: g.expires_at,
      active: !g.revoked_at && new Date(g.expires_at) > new Date(),
    })),
    payments: unwrap(pays).map((p) => ({
      id: p.id,
      amountMinor: p.amount_minor,
      refundedAmountMinor: p.refunded_amount_minor,
      currency: p.currency,
      status: p.status,
      description: p.description,
      receiptUrl: p.receipt_url,
      createdAt: p.created_at,
    })),
    eligiblePlanIds: paidPlans.filter((_, i) => unwrap(eligibility[i]!) === true).map((p) => p.id),
    pendingDeletion: unwrap(deletion).length > 0,
  };
}

export async function createApplication(db: DbClient, viewer: Viewer, input: z.infer<typeof applicationSchema>): Promise<{ id: string }> {
  const { data, error } = await db
    .from("membership_applications")
    .insert({ user_id: viewer.id, plan_id: input.planId, statement: input.statement })
    .select("id")
    .single();
  if (error?.code === "23505") throw new AppError("conflict", "You already have an open or approved application for this plan.");
  if (error?.code === "42501") throw new AppError("business_rule", "This plan does not accept applications.");
  throwIfError(error);
  return data!;
}

export async function withdrawApplication(db: DbClient, applicationId: string) {
  unwrap(await db.rpc("withdraw_application", { p_id: applicationId }));
}

export async function checkInvitation(db: DbClient, code: string) {
  const rows = unwrap(await db.rpc("check_invitation", { p_code: code }));
  const row = rows[0];
  return { valid: Boolean(row?.valid), planId: row?.plan_id ?? null, planName: row?.plan_name ?? null, preApproved: Boolean(row?.pre_approved) };
}

export async function redeemInvitation(db: DbClient, input: z.infer<typeof redeemInvitationSchema>): Promise<{ applicationId: string }> {
  const { data, error } = await db.rpc("redeem_invitation", { p_code: input.code, p_statement: input.statement });
  if (error?.code === "23505") throw new AppError("conflict", "You already have an open application for this plan.");
  throwIfError(error);
  return { applicationId: data as string };
}

export async function requestVerification(db: DbClient, viewer: Viewer, input: z.infer<typeof verificationRequestSchema>) {
  for (const p of input.evidencePaths) assertOwnedPath(viewer, p);
  const { error } = await db.from("verifications").insert({
    user_id: viewer.id,
    kind: input.kind,
    statement: input.statement,
    evidence_paths: input.evidencePaths,
  });
  if (error?.code === "23505") throw new AppError("conflict", "You already have a pending or approved verification of this type.");
  throwIfError(error);
}

export async function requestAccountDeletion(db: DbClient, viewer: Viewer, reason?: string) {
  const { error } = await db.from("account_deletion_requests").insert({ user_id: viewer.id, reason: reason ?? null });
  if (error?.code === "23505") throw new AppError("conflict", "A deletion request is already pending.");
  throwIfError(error);
}

export async function cancelAccountDeletion(db: DbClient) {
  unwrap(await db.rpc("cancel_account_deletion"));
}
