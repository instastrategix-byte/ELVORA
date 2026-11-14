export type PlanPrice = {
  id: string;
  currency: string;
  interval: "month" | "year";
  amountMinor: number;
  providers: ("stripe" | "razorpay")[];
};

export type Plan = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  audience: "individual" | "premium" | "professional" | "business" | "advertiser";
  features: string[];
  isFree: boolean;
  requiresApplication: boolean;
  requiredVerifications: ("identity" | "public_figure" | "executive")[];
  trialDays: number;
  prices: PlanPrice[];
};

export type ApplicationView = {
  id: string;
  planId: string;
  status: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";
  statement: string | null;
  reviewerNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type VerificationView = {
  id: string;
  kind: "identity" | "public_figure" | "executive";
  status: "pending" | "approved" | "rejected" | "revoked";
  reviewerNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type SubscriptionView = {
  id: string;
  planId: string;
  provider: "stripe" | "razorpay";
  status: "incomplete" | "trialing" | "active" | "past_due" | "unpaid" | "paused" | "canceled" | "expired";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

export type PaymentView = {
  id: string;
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  description: string | null;
  receiptUrl: string | null;
  createdAt: string;
};

export type MembershipOverview = {
  plans: Plan[];
  applications: ApplicationView[];
  verifications: VerificationView[];
  subscriptions: SubscriptionView[];
  payments: PaymentView[];
  eligiblePlanIds: string[];
  pendingDeletion: boolean;
};
