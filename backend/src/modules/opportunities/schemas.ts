import { z } from "zod";

export const OPPORTUNITY_KINDS = ["investment", "partnership", "hiring", "board_seat", "advisory", "acquisition", "other"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_KIND_LABELS: Record<OpportunityKind, string> = {
  investment: "Investment",
  partnership: "Partnership",
  hiring: "Hiring",
  board_seat: "Board seat",
  advisory: "Advisory",
  acquisition: "Acquisition",
  other: "Other",
};

/** Kinds that may carry a financial range. */
export const KINDS_WITH_AMOUNT: readonly OpportunityKind[] = ["investment", "acquisition"];

export const INTEREST_STATUS_LABELS = {
  pending: "Interested",
  shortlisted: "Shortlisted",
  declined: "Not a fit",
  withdrawn: "Withdrawn",
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Must be ${max} characters or fewer` })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const amount = z.coerce.number().int().min(0).max(1_000_000_000_000_000).nullable().optional();

export const opportunitySchema = z
  .object({
    kind: z.enum(OPPORTUNITY_KINDS),
    title: z.string().trim().min(5, { error: "Give it a clear title (5+ characters)" }).max(120),
    summary: optionalText(280),
    details: optionalText(4000),
    industry: optionalText(60),
    location: optionalText(120),
    remote: z.boolean().default(false),
    visibility: z.enum(["members", "connections"]).default("members"),
    amountMinMinor: amount,
    amountMaxMinor: amount,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code, e.g. USD" })
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    expiresInDays: z.coerce.number().int().min(1).max(180).default(60),
  })
  .superRefine((v, ctx) => {
    const hasAmount = v.amountMinMinor != null || v.amountMaxMinor != null;
    if (hasAmount && !KINDS_WITH_AMOUNT.includes(v.kind)) {
      ctx.addIssue({ code: "custom", path: ["amountMinMinor"], message: "Amounts are only for investment and acquisition opportunities" });
    }
    if (hasAmount && !v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose a currency for the amount" });
    if (v.amountMinMinor != null && v.amountMaxMinor != null && v.amountMinMinor > v.amountMaxMinor) {
      ctx.addIssue({ code: "custom", path: ["amountMaxMinor"], message: "The maximum must be at least the minimum" });
    }
  });
export type OpportunityInput = z.infer<typeof opportunitySchema>;

export const opportunityListSchema = z.object({
  tab: z.enum(["browse", "mine", "interested"]).default("browse"),
  kind: z.enum(OPPORTUNITY_KINDS).optional(),
  industry: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
});
export type OpportunityListQuery = z.infer<typeof opportunityListSchema>;

export const opportunityStatusSchema = z.object({ status: z.enum(["open", "closed"]) });

export const interestSchema = z.object({ note: optionalText(500) });

export const interestDecisionSchema = z.object({ userId: z.uuid(), status: z.enum(["pending", "shortlisted", "declined"]) });
