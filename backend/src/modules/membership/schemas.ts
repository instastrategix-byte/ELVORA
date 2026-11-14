import { z } from "zod";

export const applicationSchema = z.object({
  planId: z.string().regex(/^[a-z0-9_]{2,40}$/),
  statement: z
    .string()
    .trim()
    .min(40, { error: "Tell us a little more (at least 40 characters)" })
    .max(2000),
});

export const invitationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, { error: "Enter the full invitation code" })
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, { error: "Codes contain letters, numbers and dashes only" }),
});

export const redeemInvitationSchema = invitationCodeSchema.extend({
  statement: z.string().trim().max(2000).optional(),
});

export const VERIFICATION_KINDS = ["identity", "public_figure", "executive"] as const;

export const verificationRequestSchema = z.object({
  kind: z.enum(VERIFICATION_KINDS),
  statement: z.string().trim().min(20, { error: "Please describe what we should verify" }).max(2000),
  evidencePaths: z.array(z.string().min(3).max(300)).min(1, { error: "Attach at least one document" }).max(5),
});

export const checkoutSchema = z.object({
  priceId: z.uuid(),
  provider: z.enum(["stripe", "razorpay"]).optional(),
});

export const onboardingProfileSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, { error: "3–30 characters: lowercase letters, numbers and underscores" }),
  displayName: z.string().trim().min(1, { error: "Name is required" }).max(80),
  headline: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
});
