import "server-only";
import { AppError } from "@/lib/errors";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@backend/db/admin";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { sendEmail } from "@backend/modules/email/service";
import { serverEnv } from "@backend/core/env";
import { unwrap } from "@backend/http/db-errors";
import { logger } from "@backend/core/logger";
import type { PaymentProvider, ProviderId, WebhookEvent } from "./provider";
import { RazorpayProvider } from "./razorpay";
import { StripeProvider } from "./stripe";

const providers: Record<ProviderId, PaymentProvider> = {
  stripe: new StripeProvider(),
  razorpay: new RazorpayProvider(),
};

export function getProvider(id: ProviderId): PaymentProvider {
  return providers[id];
}

export function configuredProviders(): ProviderId[] {
  return (Object.keys(providers) as ProviderId[]).filter((id) => providers[id].isConfigured());
}

/**
 * Starts a hosted checkout. Price, plan and eligibility are all resolved server-side from the
 * database; the client supplies only the price id it chose. Paid features are granted later,
 * exclusively by the webhook writing a subscription record.
 */
export async function startCheckout(
  db: DbClient,
  viewer: Viewer,
  input: { priceId: string; provider?: ProviderId },
): Promise<{ url: string }> {
  const price = unwrap(await db.from("plan_prices").select("*").eq("id", input.priceId).eq("active", true).maybeSingle());
  if (!price) throw new AppError("not_found", "This price is no longer available.");
  const plan = unwrap(await db.from("membership_plans").select("*").eq("id", price.plan_id).single());

  const eligible = unwrap(await db.rpc("is_eligible_for_plan", { p_plan_id: plan.id }));
  if (!eligible) {
    throw new AppError(
      "forbidden",
      plan.requires_application
        ? "This plan requires an approved application (and verification, where applicable) before payment."
        : "You are not eligible for this plan.",
    );
  }

  const active = unwrap(
    await db.from("subscriptions").select("id").eq("user_id", viewer.id).eq("plan_id", plan.id).in("status", ["active", "trialing", "past_due"]).limit(1),
  );
  if (active.length) throw new AppError("conflict", "You already have this membership.");

  const candidates: ProviderId[] = input.provider ? [input.provider] : [serverEnv().PAYMENTS_DEFAULT_PROVIDER, "stripe", "razorpay"];
  const providerId = candidates.find((id) => {
    const ref = id === "stripe" ? price.stripe_price_id : price.razorpay_plan_id;
    return Boolean(ref) && providers[id].isConfigured();
  });
  if (!providerId) {
    throw new AppError("service_unavailable", "Online payment is not yet available for this plan. Our team will contact you.");
  }
  const provider = providers[providerId];
  const ref = (providerId === "stripe" ? price.stripe_price_id : price.razorpay_plan_id)!;

  const customer = unwrap(
    await db.from("billing_customers").select("provider_customer_id").eq("user_id", viewer.id).eq("provider", providerId).maybeSingle(),
  );

  try {
    const result = await provider.createCheckout({
      userId: viewer.id,
      email: viewer.email,
      planId: plan.id,
      priceId: price.id,
      providerPriceRef: ref,
      interval: price.billing_interval,
      trialDays: plan.trial_days,
      existingCustomerId: customer?.provider_customer_id ?? null,
      successUrl: siteUrl("/account/membership?checkout=success"),
      cancelUrl: siteUrl("/account/membership?checkout=cancelled"),
    });
    logger.info("billing.checkout_started", { provider: providerId, plan: plan.id, user: viewer.id });
    return { url: result.url };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error("billing.checkout_failed", { provider: providerId, error });
    throw new AppError("payment_failed", "We could not start checkout. Please try again shortly.");
  }
}

export async function cancelSubscription(db: DbClient, viewer: Viewer, subscriptionId: string) {
  const sub = unwrap(
    await db.from("subscriptions").select("*").eq("id", subscriptionId).eq("user_id", viewer.id).maybeSingle(),
  );
  if (!sub) throw new AppError("not_found", "Subscription not found.");
  if (!["active", "trialing", "past_due"].includes(sub.status)) throw new AppError("business_rule", "This subscription is not active.");
  if (sub.cancel_at_period_end) return { pending: false };
  try {
    await providers[sub.provider].cancelAtPeriodEnd(sub.provider_subscription_id);
  } catch (error) {
    logger.error("billing.cancel_failed", { provider: sub.provider, error });
    throw new AppError("payment_failed", "Cancellation could not be requested. Please try again or contact support.");
  }
  // Local state changes only when the provider's webhook confirms it.
  return { pending: true };
}

/**
 * Applies a verified webhook. Idempotent: the event ledger short-circuits replays, and every
 * write is an upsert keyed by provider ids, so concurrent duplicates converge.
 * Subscription state is re-fetched from the provider so out-of-order events cannot regress it.
 */
export async function processWebhook(providerId: ProviderId, rawBody: string, headers: Headers): Promise<{ duplicate: boolean }> {
  const provider = providers[providerId];
  const event = await provider.verifyWebhook(rawBody, headers);
  const admin = createAdminClient();

  const seen = unwrap(
    await admin.from("webhook_events").select("event_id").eq("provider", providerId).eq("event_id", event.eventId).maybeSingle(),
  );
  if (seen) return { duplicate: true };

  let subscriptionRowId: string | null = null;
  let userId: string | null = event.payment?.userId ?? null;

  if (event.subscriptionId) {
    const state = await provider.fetchSubscription(event.subscriptionId);
    const resolved = await resolveTrustedRefs(admin, providerId, state.userId, state.planId, state.priceId, state.providerSubscriptionId);
    if (resolved) {
      userId = resolved.userId;
      const row = unwrap(
        await admin
          .from("subscriptions")
          .upsert(
            {
              user_id: resolved.userId,
              plan_id: resolved.planId,
              price_id: resolved.priceId,
              provider: providerId,
              provider_subscription_id: state.providerSubscriptionId,
              status: state.status,
              current_period_end: state.currentPeriodEnd,
              cancel_at_period_end: state.cancelAtPeriodEnd,
              canceled_at: state.canceledAt,
            },
            { onConflict: "provider,provider_subscription_id" },
          )
          .select("id")
          .single(),
      );
      subscriptionRowId = row.id;
      if (state.customerId) {
        await admin
          .from("billing_customers")
          .upsert(
            { user_id: resolved.userId, provider: providerId, provider_customer_id: state.customerId },
            { onConflict: "user_id,provider", ignoreDuplicates: true },
          );
      }
    }
  }

  if (event.payment && userId) {
    unwrap(
      await admin.from("payments").upsert(
        {
          user_id: userId,
          subscription_id: subscriptionRowId,
          provider: providerId,
          provider_payment_id: event.payment.providerPaymentId,
          amount_minor: event.payment.amountMinor,
          refunded_amount_minor: event.payment.refundedAmountMinor,
          currency: event.payment.currency,
          status: event.payment.status,
          description: event.payment.description,
          receipt_url: event.payment.receiptUrl,
        },
        { onConflict: "provider,provider_payment_id" },
      ),
    );
    if (event.payment.status === "failed") await notifyPaymentFailed(admin, userId);
  }

  if (event.refund) {
    unwrap(
      await admin
        .from("payments")
        .update({
          refunded_amount_minor: event.refund.refundedAmountMinor,
          ...(event.refund.fullyRefunded ? { status: "refunded" as const } : {}),
        })
        .eq("provider", providerId)
        .eq("provider_payment_id", event.refund.providerPaymentId),
    );
  }

  await applyAdBillingEvent(admin, event);

  await admin
    .from("webhook_events")
    .upsert({ provider: providerId, event_id: event.eventId, event_type: event.type }, { onConflict: "provider,event_id", ignoreDuplicates: true });
  logger.info("billing.webhook_processed", { provider: providerId, type: event.type, event: event.eventId });
  return { duplicate: false };
}

/**
 * Metadata on provider objects was written by our server at checkout, but it is still
 * cross-checked against the database before it can grant anything.
 */
async function resolveTrustedRefs(
  admin: DbClient,
  providerId: ProviderId,
  userId: string | null,
  planId: string | null,
  priceId: string | null,
  providerSubscriptionId: string,
): Promise<{ userId: string; planId: string; priceId: string | null } | null> {
  const existing = unwrap(
    await admin
      .from("subscriptions")
      .select("user_id, plan_id, price_id")
      .eq("provider", providerId)
      .eq("provider_subscription_id", providerSubscriptionId)
      .maybeSingle(),
  );
  if (existing) return { userId: existing.user_id, planId: existing.plan_id, priceId: existing.price_id };
  if (!userId || !planId || !priceId) {
    logger.warn("billing.webhook_unmapped_subscription", { provider: providerId });
    return null;
  }
  const price = unwrap(await admin.from("plan_prices").select("id, plan_id").eq("id", priceId).maybeSingle());
  const profile = unwrap(await admin.from("profiles").select("id").eq("id", userId).maybeSingle());
  if (!price || price.plan_id !== planId || !profile) {
    logger.warn("billing.webhook_metadata_mismatch", { provider: providerId });
    return null;
  }
  return { userId, planId, priceId };
}

async function notifyPaymentFailed(admin: DbClient, userId: string) {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data.user?.email) {
      await sendEmail({
        to: data.user.email,
        subject: "Your ELVORA payment could not be processed",
        text: `We were unable to process your latest membership payment. Please update your payment method from ${siteUrl("/account/membership")} to keep your membership active.`,
      });
    }
  } catch (error) {
    logger.warn("billing.payment_failed_email_error", { error });
  }
}

export type { WebhookEvent };

/**
 * Advertising balance events. The ledger functions are idempotent (keyed by Checkout Session /
 * charge), so a replayed or concurrent webhook can never credit twice. A currency mismatch is a
 * permanent error: it is logged for staff instead of making the provider retry forever.
 */
async function applyAdBillingEvent(admin: ReturnType<typeof createAdminClient>, event: WebhookEvent): Promise<void> {
  if (event.adTopUp) {
    const t = event.adTopUp;
    const { error } = await admin.rpc("ad_record_top_up", {
      p_account: t.accountId,
      p_amount_minor: t.amountMinor,
      p_currency: t.currency,
      p_session_id: t.sessionId,
      p_payment_intent: t.paymentIntentId,
    });
    if (error) {
      if (error.code === "22023" || error.code === "23503") {
        logger.error("ads.topup_rejected", { session: t.sessionId, code: error.code, message: error.message });
      } else {
        throw error;
      }
    } else {
      logger.info("ads.topup_recorded", { session: t.sessionId, account: t.accountId });
    }
  }
  if (event.adRefund) {
    const r = event.adRefund;
    const { error } = await admin.rpc("ad_record_refund", {
      p_payment_intent: r.paymentIntentId,
      p_charge_id: r.chargeId,
      p_refunded_total: r.refundedTotalMinor,
    });
    if (error) throw error;
  }
  if (event.adPaymentFailed) {
    const { error } = await admin.rpc("ad_mark_payment_failed", { p_account: event.adPaymentFailed.accountId });
    if (error && error.code !== "22P02") throw error;
  }
}
