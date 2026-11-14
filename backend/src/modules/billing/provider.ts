import "server-only";

export type ProviderId = "stripe" | "razorpay";

export type SubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "paused" | "canceled" | "expired";

export type CheckoutRequest = {
  userId: string;
  email: string | null;
  planId: string;
  priceId: string;
  providerPriceRef: string;
  interval: "month" | "year";
  trialDays: number;
  existingCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
};

/** Normalized subscription state, always re-fetched from the provider (never trusted from the client). */
export type ProviderSubscription = {
  providerSubscriptionId: string;
  customerId: string | null;
  userId: string | null;
  planId: string | null;
  priceId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

export type ProviderPayment = {
  providerPaymentId: string;
  providerSubscriptionId: string | null;
  userId: string | null;
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  description: string | null;
  receiptUrl: string | null;
};

export type WebhookEvent = {
  eventId: string;
  type: string;
  subscriptionId?: string;
  payment?: ProviderPayment;
  refund?: { providerPaymentId: string; refundedAmountMinor: number; fullyRefunded: boolean };
};

export interface PaymentProvider {
  readonly id: ProviderId;
  isConfigured(): boolean;
  createCheckout(req: CheckoutRequest): Promise<{ url: string; customerId?: string; providerSubscriptionId?: string }>;
  fetchSubscription(providerSubscriptionId: string): Promise<ProviderSubscription>;
  cancelAtPeriodEnd(providerSubscriptionId: string): Promise<void>;
  /** Verifies the signature over the RAW body and returns a normalized event, or throws. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}
