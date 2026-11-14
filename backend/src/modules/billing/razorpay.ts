import "server-only";
import Razorpay from "razorpay";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@backend/core/env";
import type { PaymentProvider, ProviderSubscription, SubscriptionStatus, WebhookEvent } from "./provider";

const STATUS: Record<string, SubscriptionStatus> = {
  created: "incomplete",
  authenticated: "incomplete",
  active: "active",
  pending: "past_due",
  halted: "unpaid",
  paused: "paused",
  cancelled: "canceled",
  completed: "expired",
  expired: "expired",
};

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

type RazorpayNotes = Record<string, string | number | undefined> | undefined;
const note = (notes: RazorpayNotes, key: string) => {
  const v = notes?.[key];
  return v === undefined || v === null ? null : String(v);
};

type WebhookPayload = {
  event: string;
  payload?: {
    subscription?: { entity: { id: string } };
    payment?: { entity: { id: string; amount: number; currency: string; status: string; description?: string | null; notes?: RazorpayNotes; amount_refunded?: number } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
};

export class RazorpayProvider implements PaymentProvider {
  readonly id = "razorpay" as const;
  private client: Razorpay | undefined;

  isConfigured(): boolean {
    const env = serverEnv();
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
  }

  private razorpay(): Razorpay {
    const env = serverEnv();
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new AppError("service_unavailable", "Razorpay is not configured.");
    this.client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    return this.client;
  }

  async createCheckout(req: Parameters<PaymentProvider["createCheckout"]>[0]) {
    const sub = await this.razorpay().subscriptions.create({
      plan_id: req.providerPriceRef,
      // Number of billing cycles before the mandate must be renewed (Razorpay requires a bound).
      total_count: req.interval === "year" ? 10 : 120,
      customer_notify: 1,
      notes: { user_id: req.userId, plan_id: req.planId, price_id: req.priceId },
      ...(req.trialDays > 0 ? { start_at: Math.floor(Date.now() / 1000) + req.trialDays * 86_400 } : {}),
    });
    if (!sub.short_url) throw new AppError("payment_failed", "Checkout could not be started.");
    return { url: sub.short_url, providerSubscriptionId: sub.id };
  }

  async fetchSubscription(id: string): Promise<ProviderSubscription> {
    const sub = await this.razorpay().subscriptions.fetch(id);
    const notes = sub.notes as RazorpayNotes;
    return {
      providerSubscriptionId: sub.id,
      customerId: (sub.customer_id as string | null | undefined) ?? null,
      userId: note(notes, "user_id"),
      planId: note(notes, "plan_id"),
      priceId: note(notes, "price_id"),
      status: STATUS[sub.status] ?? "incomplete",
      currentPeriodEnd: iso(sub.current_end as number | null | undefined),
      cancelAtPeriodEnd: false,
      canceledAt: sub.status === "cancelled" ? iso((sub.ended_at as number | null | undefined) ?? null) : null,
    };
  }

  async cancelAtPeriodEnd(id: string): Promise<void> {
    await this.razorpay().subscriptions.cancel(id, true);
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent> {
    const secret = serverEnv().RAZORPAY_WEBHOOK_SECRET;
    const signature = headers.get("x-razorpay-signature");
    const eventId = headers.get("x-razorpay-event-id");
    if (!secret || !signature || !eventId) throw new AppError("bad_request", "Missing webhook signature.");
    if (!Razorpay.validateWebhookSignature(rawBody, signature, secret)) {
      throw new AppError("bad_request", "Invalid webhook signature.");
    }
    const body = JSON.parse(rawBody) as WebhookPayload;
    const subscriptionId = body.payload?.subscription?.entity.id;
    const pay = body.payload?.payment?.entity;

    if (body.event === "refund.processed" && body.payload?.refund) {
      const r = body.payload.refund.entity;
      return {
        eventId,
        type: body.event,
        refund: {
          providerPaymentId: r.payment_id,
          refundedAmountMinor: pay?.amount_refunded ?? r.amount,
          fullyRefunded: pay ? (pay.amount_refunded ?? 0) >= pay.amount : false,
        },
      };
    }

    const payment =
      pay && (body.event === "subscription.charged" || body.event === "payment.failed")
        ? {
            providerPaymentId: pay.id,
            providerSubscriptionId: subscriptionId ?? null,
            userId: note(pay.notes, "user_id"),
            amountMinor: pay.amount,
            refundedAmountMinor: pay.amount_refunded ?? 0,
            currency: pay.currency.toUpperCase(),
            status: body.event === "payment.failed" ? ("failed" as const) : ("paid" as const),
            description: pay.description ?? "ELVORA membership",
            receiptUrl: null,
          }
        : undefined;

    return { eventId, type: body.event, subscriptionId, payment };
  }
}
