import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { siteUrl } from "@/lib/env";
import { decodeCursor, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getProvider } from "@backend/modules/billing/service";
import type { StripeProvider } from "@backend/modules/billing/stripe";
import { unwrap } from "@backend/http/db-errors";
import { logger } from "@backend/core/logger";

/*
 * Advertising billing. Advertisers prepay; the balance is derived from the ledger in SQL
 * (migration 20261122000200) and is never written from here. Top-ups credit the balance only
 * when Stripe's signed webhook reports the payment (see billing/service.ts applyAdBillingEvent).
 */

export type BillingOverview = {
  currency: string;
  balanceMinor: number;
  spendLimitMinor: number | null;
  billingStatus: "ok" | "payment_failed" | "suspended";
  billingMode: "prepaid" | "subscription";
  spendThisMonthMinor: number;
  spendTodayMinor: number;
  topUp: { minMinor: number; maxMinor: number } | null;
};

export async function hasAccountRole(db: DbClient, accountId: string, min: "owner" | "admin" | "editor" | "analyst"): Promise<boolean> {
  return Boolean(unwrap(await db.rpc("ad_account_has_role", { p_account: accountId, p_min: min })));
}

export async function getBillingOverview(db: DbClient, accountId: string): Promise<BillingOverview> {
  const row = unwrap(await db.rpc("ad_billing_overview", { p_account: accountId }))[0];
  if (!row) throw new AppError("not_found", "Advertiser account not found.");
  return {
    currency: row.currency,
    balanceMinor: Number(row.balance_minor),
    spendLimitMinor: row.spend_limit_minor == null ? null : Number(row.spend_limit_minor),
    billingStatus: row.billing_status as BillingOverview["billingStatus"],
    billingMode: row.billing_mode === "subscription" ? "subscription" : "prepaid",
    spendThisMonthMinor: Number(row.spend_this_month_minor),
    spendTodayMinor: Number(row.spend_today_minor),
    topUp: row.min_top_up_minor != null && row.max_top_up_minor != null ? { minMinor: Number(row.min_top_up_minor), maxMinor: Number(row.max_top_up_minor) } : null,
  };
}

export type LedgerEntry = {
  id: string;
  kind: "top_up" | "spend" | "refund" | "adjustment" | "credit" | "reversal";
  amountMinor: number;
  currency: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

const LEDGER_PAGE = 50;

/** Ledger entries newest first. Spend is one entry per day (updated as delivery accrues). */
export async function listTransactions(db: DbClient, accountId: string, cursor?: string): Promise<Page<LedgerEntry>> {
  let q = db
    .from("ad_transactions")
    .select("id, kind, amount_minor, currency, description, created_at, updated_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LEDGER_PAGE + 1);
  const c = decodeCursor(cursor);
  if (c) q = q.or(`created_at.lt.${c.t},and(created_at.eq.${c.t},id.lt.${c.id})`);
  const rows = unwrap(await q);
  const page = toPage(rows, LEDGER_PAGE, (r) => ({ t: r.created_at, id: r.id }));
  return {
    items: page.items.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountMinor: Number(r.amount_minor),
      currency: r.currency,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    nextCursor: page.nextCursor,
  };
}

export async function listStatements(db: DbClient, accountId: string) {
  return unwrap(await db.from("ad_invoices").select("*").eq("account_id", accountId).order("period_start", { ascending: false }).limit(36));
}

export const statementSchema = z.object({ accountId: z.uuid(), month: z.string().regex(/^\d{4}-\d{2}$/, { error: "Use YYYY-MM" }) });

export async function generateStatement(db: DbClient, input: z.infer<typeof statementSchema>): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("generate_ad_statement", { p_account: input.accountId, p_month: `${input.month}-01` }));
  return { id: id as string };
}

export const topUpSchema = z.object({ accountId: z.uuid(), amountMinor: z.number().int().positive() });

/** Starts a Stripe Checkout for a balance top-up. Requires the admin role on the account. */
export async function startTopUp(db: DbClient, viewer: Viewer, input: z.infer<typeof topUpSchema>): Promise<{ url: string }> {
  if (!(await hasAccountRole(db, input.accountId, "admin"))) {
    throw new AppError("forbidden", "Only account owners and admins can add funds.");
  }
  const overview = await getBillingOverview(db, input.accountId);
  if (overview.billingStatus === "suspended") throw new AppError("forbidden", "This advertiser account is suspended.");
  if (!overview.topUp) throw new AppError("service_unavailable", `Online top-ups aren't available in ${overview.currency} yet.`);
  if (input.amountMinor < overview.topUp.minMinor || input.amountMinor > overview.topUp.maxMinor) {
    throw new AppError("validation_failed", "Choose an amount within the allowed range.", { amountMinor: ["Amount is outside the allowed range."] });
  }
  const stripe = getProvider("stripe") as StripeProvider;
  if (!stripe.isConfigured()) throw new AppError("service_unavailable", "Card payments are not configured yet.");
  try {
    const result = await stripe.createTopUpCheckout({
      accountId: input.accountId,
      userId: viewer.id,
      email: viewer.email,
      amountMinor: input.amountMinor,
      currency: overview.currency,
      successUrl: siteUrl("/ads/billing?topup=success"),
      cancelUrl: siteUrl("/ads/billing?topup=cancelled"),
    });
    logger.info("ads.topup_checkout_started", { account: input.accountId, amount: input.amountMinor });
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("ads.topup_checkout_failed", { account: input.accountId });
    throw new AppError("payment_failed", "We couldn't start checkout. Please try again.");
  }
}

export const adjustSchema = z.object({ accountId: z.uuid(), amountMinor: z.number().int().refine((n) => n !== 0), reason: z.string().trim().min(3).max(300) });
export const billingStatusSchema = z.object({
  accountId: z.uuid(),
  status: z.enum(["ok", "payment_failed", "suspended"]),
  reason: z.string().trim().min(3).max(300),
});

/** Staff (admin) only — enforced again in SQL, which also writes the audit log. */
export async function adjustBalance(db: DbClient, input: z.infer<typeof adjustSchema>) {
  return { id: unwrap(await db.rpc("ad_adjust_balance", { p_account: input.accountId, p_amount_minor: input.amountMinor, p_reason: input.reason })) };
}

export async function setBillingStatus(db: DbClient, input: z.infer<typeof billingStatusSchema>) {
  unwrap(await db.rpc("ad_set_billing_status", { p_account: input.accountId, p_status: input.status, p_reason: input.reason }));
}
