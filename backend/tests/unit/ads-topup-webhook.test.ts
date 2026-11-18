import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adTopUpFromSession } = await import("@backend/modules/billing/stripe");

const session = {
  id: "cs_123",
  payment_status: "paid",
  amount_total: 5000,
  currency: "eur",
  payment_intent: "pi_123",
  // Metadata is ours, but amounts are always taken from Stripe's own fields.
  metadata: { kind: "ad_topup", account_id: "acc-1", amount_minor: "999999" },
};

describe("ad top-up webhook mapping", () => {
  it("credits the amount Stripe actually charged", () => {
    expect(adTopUpFromSession("checkout.session.completed", session)).toEqual({
      adTopUp: { sessionId: "cs_123", accountId: "acc-1", amountMinor: 5000, currency: "EUR", paymentIntentId: "pi_123" },
    });
  });

  it("does nothing for unpaid sessions (async methods settle later)", () => {
    expect(adTopUpFromSession("checkout.session.completed", { ...session, payment_status: "unpaid" })).toEqual({});
  });

  it("credits when an async payment succeeds, and flags failures", () => {
    expect(adTopUpFromSession("checkout.session.async_payment_succeeded", session).adTopUp?.amountMinor).toBe(5000);
    expect(adTopUpFromSession("checkout.session.async_payment_failed", session)).toEqual({ adPaymentFailed: { accountId: "acc-1" } });
  });

  it("ignores sessions without an account", () => {
    expect(adTopUpFromSession("checkout.session.completed", { ...session, metadata: { kind: "ad_topup" } })).toEqual({});
  });
});
