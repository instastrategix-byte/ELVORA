import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CancelSubscriptionButton, PaymentOptions, WithdrawApplicationButton } from "@/components/account/billing-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PlanCard } from "@/components/membership/plan-card";
import { StatusBadge } from "@/components/membership/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/primitives";
import { formatDate, formatMoney } from "@/lib/format";
import { configuredProviders } from "@backend/modules/billing/service";
import { getMembershipOverview } from "@backend/modules/membership/service";
import type { MembershipOverview, Plan } from "@backend/modules/membership/types";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Membership & billing" };

export default async function MembershipAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/account/membership" });
  const sp = await searchParams;
  let o: MembershipOverview;
  try {
    o = await getMembershipOverview(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="your membership" />;
  }

  const live = o.subscriptions.filter((s) => ["active", "trialing", "past_due", "incomplete"].includes(s.status));
  const planName = (id: string) => o.plans.find((p) => p.id === id)?.name ?? id;
  const hasActive = live.some((s) => s.status === "active" || s.status === "trialing");

  return (
    <div className="space-y-10">
      {sp.checkout === "success" ? (
        hasActive ? (
          <Alert tone="success" title="Your membership is active">Thank you. Your new features are available now.</Alert>
        ) : (
          <Alert tone="info" title="Payment submitted — activation pending">
            We activate memberships only after the payment provider confirms your subscription. This usually takes under a minute; refresh shortly.
          </Alert>
        )
      ) : null}
      {sp.checkout === "cancelled" ? <Alert tone="warning" title="Checkout cancelled">No payment was taken. You can try again any time.</Alert> : null}
      {sp.applied ? <Alert tone="success" title="Application received">We&apos;ll notify you when a decision is made.</Alert> : null}

      <section aria-labelledby="current">
        <h2 id="current" className="display mb-4 text-3xl">
          Your membership
        </h2>
        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-medium">Member</p>
              <p className="text-sm text-muted">Included with your account</p>
            </div>
            <StatusBadge status="active" />
          </div>
          {o.grants
            .filter((g) => g.active)
            .map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-medium">{planName(g.planId)}</p>
                  <p className="text-sm text-muted">Complimentary access · ends {formatDate(g.expiresAt)} · no payment involved</p>
                </div>
                <StatusBadge status="active" label="Complimentary" />
              </div>
            ))}
          {live.map((s) => (
            <div key={s.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{planName(s.planId)}</p>
                <p className="text-sm text-muted">
                  {s.status === "past_due"
                    ? "Payment failed — update your payment method with the provider to keep access."
                    : s.status === "incomplete"
                      ? "Awaiting payment confirmation."
                      : s.cancelAtPeriodEnd
                        ? `Ends ${s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : "at period end"}`
                        : s.currentPeriodEnd
                          ? `Renews ${formatDate(s.currentPeriodEnd)}`
                          : "Active"}{" "}
                  · via {s.provider === "stripe" ? "Stripe" : "Razorpay"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={s.cancelAtPeriodEnd ? "canceled" : s.status} label={s.cancelAtPeriodEnd ? "Cancels at period end" : undefined} />
                {!s.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(s.status) ? <CancelSubscriptionButton subscriptionId={s.id} /> : null}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section aria-labelledby="plans">
        <h2 id="plans" className="display mb-2 text-3xl">
          Memberships
        </h2>
        <p className="mb-5 text-sm text-muted">Paid features unlock only after an approved application (where required) and a confirmed payment.</p>
        <div className="grid gap-5 md:grid-cols-2">
          {o.plans
            .filter((p) => !p.isFree)
            .map((p) => (
              <PlanCard key={p.id} plan={p} footer={<PlanAction plan={p} overview={o} />} />
            ))}
        </div>
      </section>

      {o.applications.length ? (
        <section aria-labelledby="apps">
          <h2 id="apps" className="display mb-4 text-3xl">
            Applications
          </h2>
          <Card className="divide-y divide-border">
            {o.applications.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{planName(a.planId)}</p>
                  <p className="text-sm text-muted">
                    Submitted {formatDate(a.createdAt)}
                    {a.decidedAt ? ` · Decided ${formatDate(a.decidedAt)}` : ""}
                  </p>
                  {a.reviewerNotes ? <p className="mt-1 text-sm text-muted">Note from our team: {a.reviewerNotes}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {["submitted", "under_review"].includes(a.status) ? <WithdrawApplicationButton applicationId={a.id} /> : null}
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="payments">
        <h2 id="payments" className="display mb-4 text-3xl">
          Payment history
        </h2>
        {o.payments.length ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Payments and invoices</caption>
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 font-medium">Date</th>
                  <th scope="col" className="p-4 font-medium">Description</th>
                  <th scope="col" className="p-4 font-medium">Amount</th>
                  <th scope="col" className="p-4 font-medium">Status</th>
                  <th scope="col" className="p-4 font-medium"><span className="sr-only">Receipt</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {o.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-4 whitespace-nowrap">{formatDate(p.createdAt)}</td>
                    <td className="p-4">{p.description ?? "Membership"}</td>
                    <td className="p-4 whitespace-nowrap">
                      {formatMoney(p.amountMinor, p.currency)}
                      {p.refundedAmountMinor > 0 ? <span className="block text-xs text-muted">Refunded {formatMoney(p.refundedAmountMinor, p.currency)}</span> : null}
                    </td>
                    <td className="p-4"><StatusBadge status={p.status} /></td>
                    <td className="p-4 text-right">
                      {p.receiptUrl ? (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                          Invoice <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="text-sm text-muted">No payments yet.</p>
        )}
      </section>
    </div>
  );
}

function PlanAction({ plan, overview }: { plan: Plan; overview: MembershipOverview }) {
  const subscribed = overview.subscriptions.some((s) => s.planId === plan.id && ["active", "trialing", "past_due"].includes(s.status));
  if (subscribed) return <StatusBadge status="active" label="Your current plan" />;
  const app = overview.applications.find((a) => a.planId === plan.id && ["submitted", "under_review", "approved"].includes(a.status));
  const eligible = overview.eligiblePlanIds.includes(plan.id);

  if (eligible) {
    const configured = configuredProviders();
    const purchasable = plan.prices
      .map((p) => ({ ...p, available: p.providers.filter((id) => configured.includes(id)) }))
      .filter((p) => p.available.length > 0);
    if (!purchasable.length) {
      return <p className="text-sm text-muted">Approved. Online payment isn&apos;t enabled for this plan yet — our team will contact you to activate it.</p>;
    }
    return (
      <div className="space-y-4">
        {purchasable.map((p) => (
          <PaymentOptions key={p.id} priceId={p.id} providers={p.available} amountLabel={`${formatMoney(p.amountMinor, p.currency)} / ${p.interval}`} />
        ))}
      </div>
    );
  }
  if (app?.status === "approved" && plan.requiredVerifications.length) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/account/verification">Complete verification to continue</Link>
      </Button>
    );
  }
  if (app) return <StatusBadge status={app.status} label={app.status === "approved" ? "Approved" : "Application under review"} />;
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={`/apply?plan=${plan.id}`}>Apply</Link>
    </Button>
  );
}
