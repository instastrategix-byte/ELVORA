import { z } from "zod";

const note = z.string().trim().max(2000).optional();

export const applicationDecisionSchema = z.object({ status: z.enum(["under_review", "approved", "rejected"]), note });
export const verificationDecisionSchema = z.object({ status: z.enum(["approved", "rejected", "revoked"]), note });
export const businessReviewSchema = z.object({ status: z.enum(["approved", "rejected", "suspended"]), note });
export const listingReviewSchema = z.object({ approve: z.boolean(), note });
export const campaignReviewSchema = z.object({ action: z.enum(["approve", "reject"]), note });
export const dismissReportSchema = z.object({ note });

/** Complimentary plan grant (admins). The SQL function re-validates every field. */
export const planGrantSchema = z.object({
  handle: z
    .string()
    .trim()
    .transform((h) => h.replace(/^@/, "").toLowerCase())
    .pipe(z.string().min(2, { error: "Enter the member's handle" }).max(40)),
  planId: z.string().trim().min(1, { error: "Choose a plan" }),
  days: z.coerce.number().int().min(1, { error: "At least 1 day" }).max(366, { error: "At most 366 days" }),
  reason: z.string().trim().min(3, { error: "A reason is required" }).max(500),
});
export const revokeGrantSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const moderationSchema = z
  .object({
    action: z.enum(["hide_content", "remove_content", "restore_content", "warn", "suspend", "reinstate"]),
    reason: z.string().trim().min(3, { error: "A reason is required" }).max(2000),
    targetType: z.enum(["post", "comment", "profile", "listing", "business", "message"]).optional(),
    targetId: z.uuid().optional(),
    targetUserId: z.uuid().optional(),
    reportId: z.uuid().optional(),
  })
  .refine(
    (m) =>
      ["suspend", "reinstate", "warn"].includes(m.action) ? Boolean(m.targetUserId) : Boolean(m.targetType && m.targetId),
    { error: "Missing moderation target", path: ["targetId"] },
  );
