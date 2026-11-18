import "server-only";
import Stripe from "stripe";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@backend/core/env";
import type { PaymentProvider, ProviderSubscription, SubscriptionStatus, WebhookEvent } from "./provider";

const STATUS: Record<string, SubscriptionStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "expired",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  paused: "paused",
  canceled: "canceled",
};

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  private client: Stripe | undefined;

  isConfigured(): boolean {
    const env = serverEnv();
    return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  }

  private stripe(): Stripe {
    const key = serverEnv().STRIPE_SECRET_KEY;
    if (!key) throw new AppError("service_unavailable", "Stripe is not configured.");
    this.client ??= new Stripe(key);
    return this.client;
  }

  async createCheckout(req: Parameters<PaymentProvider["createCheckout"]>[0]) {
    const metadata = { user_id: req.userId, plan_id: req.planId, price_id: req.priceId };
    const session = await this.stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: req.providerPriceRef, quantity: 1 }],
      client_reference_id: req.userId,
      ...(req.existingCustomerId ? { customer: req.existingCustomerId } : req.email ? { customer_email: req.email } : {}),
      metadata,
      subscription_data: { metadata, ...(req.trialDays > 0 ? { trial_period_days: req.trialDays } : {}) },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // No payment_method_types: Stripe shows every method enabled in the Dashboard that suits the
      // customer's location and currency (cards, Apple Pay, Google Pay, Link and local methods).
      locale: "auto",
      billing_address_collection: "auto",
      allow_promotion_codes: true,
    });
    if (!session.url) throw new AppError("payment_failed", "Checkout could not be started.");
    return { url: session.url };
  }

  async fetchSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.stripe().subscriptions.retrieve(id);
    const item = sub.items.data[0];
    return {
      providerSubscriptionId: sub.id,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      userId: sub.metadata.user_id ?? null,
      planId: sub.metadata.plan_id ?? null,
      priceId: sub.metadata.price_id ?? null,
      status: STATUS[sub.status] ?? "incomplete",
      currentPeriodEnd: iso(item?.current_period_end),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: iso(sub.canceled_at),
    };
  }

  async cancelAtPeriodEnd(id: string): Promise<void> {
    await this.stripe().subscriptions.update(id, { cancel_at_period_end: true });
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent> {
    const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
    const signature = headers.get("stripe-signature");
    if (!secret || !signature) throw new AppError("bad_request", "Missing webhook signature.");
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new AppError("bad_request", "Invalid webhook signature.");
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        return { eventId: event.id, type: event.type, subscriptionId: event.data.object.id };
      case "checkout.session.completed": {
        const s = event.data.object;
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
        return { eventId: event.id, type: event.type, subscriptionId: subId ?? undefined };
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const subRef = inv.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
        return {
          eventId: event.id,
          type: event.type,
          subscriptionId: subscriptionId ?? undefined,
          payment: {
            providerPaymentId: inv.id ?? event.id,
            providerSubscriptionId: subscriptionId ?? null,
            userId: inv.parent?.subscription_details?.metadata?.user_id ?? null,
            amountMinor: event.type === "invoice.paid" ? inv.amount_paid : inv.amount_due,
            refundedAmountMinor: 0,
            currency: inv.currency.toUpperCase(),
            status: event.type === "invoice.paid" ? "paid" : "failed",
            description: inv.lines.data[0]?.description ?? "ELVORA membership",
            receiptUrl: inv.hosted_invoice_url ?? null,
          },
        };
      }
      default:
        return { eventId: event.id, type: event.type };
    }
  }
}
