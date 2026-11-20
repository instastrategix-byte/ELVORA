import type { Metadata } from "next";
import { Ledger, Statements, TopUpForm, type Statement } from "@/components/ads-manager/billing-panel";
import { loadAdsPage, rethrowNavigation } from "@/app/(ads)/ads-manager/_lib/load";
import { moneyOrDash, roleAtLeast } from "@/components/ads-manager/model";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format";
import { getBillingOverview, listStatements, listTransactions } from "@backend/modules/advertising/billing/service";
import { getProvider } from "@backend/modules/billing/service";

export const metadata: Metadata = { title: "Ads Manager · Billing" };

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const { db, account } = await loadAdsPage(accountId, "billing");
  let data;
  try {
    const [overview, transactions, statements] = await Promise.all([getBillingOverview(db, accountId), listTransactions(db, accountId), listStatements(db, accountId)]);
    data = { overview, transactions, statements: statements as Statement[] };
  } catch (error) {
    rethrowNavigation(error);
    return <ServiceNotice error={error} what="billing" />;
  }
  const { overview: o } = data;
  const isAdmin = roleAtLeast(account.role, "admin");
  const stripeReady = getProvider("stripe").isConfigured();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Billing" title="Billing" description="Prepaid balance: ads draw it down as they deliver, and stop when it runs out." />

      {sp.topup === "success" ? (
        <Alert tone="success" title="Payment received by Stripe">
          Your balance updates as soon as Stripe confirms the payment — usually within a minute. Refresh to see it.
        </Alert>
      ) : null}
      {sp.topup === "cancelled" ? <Alert tone="info">Checkout was cancelled. No payment was taken.</Alert> : null}
      {o.billingStatus === "payment_failed" ? <Alert tone="error" title="Your last payment failed">Delivery is paused until a top-up succeeds.</Alert> : null}
      {o.billingStatus === "suspended" ? <Alert tone="error" title="Billing suspended">Contact support for details.</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted">Balance</p>
          <p className="mt-1 text-3xl font-semibold">{o.billingMode === "prepaid" ? formatMoney(o.balanceMinor, o.currency) : "Subscription"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Spent today (UTC)</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(o.spendTodayMinor, o.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Spent this month</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(o.spendThisMonthMinor, o.currency)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Account spend limit</p>
          <p className="mt-1 text-2xl font-semibold">{moneyOrDash(o.spendLimitMinor, o.currency)}</p>
          <p className="text-xs text-muted">Change it in Settings</p>
        </Card>
      </div>

      {o.billingMode === "prepaid" ? (
        <Card className="space-y-4 p-5">
          <h2 className="font-medium">Add funds</h2>
          {isAdmin ? (
            <TopUpForm accountId={accountId} overview={o} stripeReady={stripeReady} />
          ) : (
            <p className="text-sm text-muted">Only account owners and admins can add funds.</p>
          )}
          <p className="text-xs text-muted">Payments are processed by Stripe; ELVORA never sees your card details. Funds are added only after Stripe confirms the payment.</p>
        </Card>
      ) : (
        <Alert tone="info">This account is billed through its advertiser subscription, so there&apos;s no prepaid balance.</Alert>
      )}

      <section aria-labelledby="ledger" className="space-y-3">
        <h2 id="ledger" className="font-medium">
          Transactions
        </h2>
        <Card className="p-2">
          <Ledger accountId={accountId} initial={data.transactions} />
        </Card>
      </section>

      <section aria-labelledby="statements" className="space-y-3">
        <h2 id="statements" className="font-medium">
          Monthly statements
        </h2>
        <p className="text-sm text-muted">Statements of account summarise the ledger for a completed month. They are not tax invoices.</p>
        <Statements accountId={accountId} statements={data.statements} canGenerate={isAdmin} />
      </section>
    </div>
  );
}
