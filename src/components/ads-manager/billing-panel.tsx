"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney, titleCase } from "@/lib/format";
import type { Page } from "@/lib/pagination";
import type { BillingOverview, LedgerEntry } from "@backend/modules/advertising/billing/service";
import { majorToMinor, minorToMajor } from "./model";
import { LocalTime } from "@/components/ui/local-time";

export type Statement = {
  id: string;
  number: string;
  period_start: string;
  period_end: string;
  opening_balance_minor: number;
  top_ups_minor: number;
  spend_minor: number;
  adjustments_minor: number;
  closing_balance_minor: number;
  currency: string;
  issued_at: string;
};

const KIND_TONE: Record<LedgerEntry["kind"], "success" | "neutral" | "warning" | "danger" | "accent"> = {
  top_up: "success",
  spend: "neutral",
  refund: "warning",
  adjustment: "accent",
  credit: "success",
  reversal: "danger",
};

/** Top up the prepaid balance through Stripe Checkout. The balance changes only when Stripe's webhook confirms payment. */
export function TopUpForm({ accountId, overview, stripeReady }: { accountId: string; overview: BillingOverview; stripeReady: boolean }) {
  const [amount, setAmount] = useState(overview.topUp ? String(minorToMajor(overview.topUp.minMinor, overview.currency)) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cur = overview.currency;

  if (!overview.topUp || !stripeReady) {
    return (
      <Alert tone="warning" title="Online top-ups aren't available yet">
        {!stripeReady ? "Card payments haven't been configured for ELVORA yet." : `Top-ups in ${cur} haven't been enabled yet.`} Contact support to add funds.
      </Alert>
    );
  }
  const { minMinor, maxMinor } = overview.topUp;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const minor = majorToMinor(Number(amount), cur);
    if (!Number.isFinite(minor) || minor < minMinor || minor > maxMinor) {
      setError(`Enter between ${formatMoney(minMinor, cur)} and ${formatMoney(maxMinor, cur)}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/v1/ads-manager/billing/top-up", { method: "POST", body: { accountId, amountMinor: minor } });
      window.location.assign(url);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
      <Field id="topup" label={`Amount (${cur})`} hint={`${formatMoney(minMinor, cur)} – ${formatMoney(maxMinor, cur)}`} error={error ?? undefined} className="w-48">
        {(a) => <Input type="number" inputMode="decimal" min={minorToMajor(minMinor, cur)} max={minorToMajor(maxMinor, cur)} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} {...a} />}
      </Field>
      <Button type="submit" disabled={pending} className="mb-5">
        {pending ? "Opening checkout…" : "Add funds"}
      </Button>
    </form>
  );
}

export function Ledger({ accountId, initial }: { accountId: string; initial: Page<LedgerEntry> }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    try {
      const r = await api<{ transactions: Page<LedgerEntry> }>(`/api/v1/ads-manager/billing?account=${accountId}&cursor=${encodeURIComponent(cursor)}`);
      setItems((x) => [...x, ...r.transactions.items]);
      setCursor(r.transactions.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (!items.length) return <p className="p-4 text-sm text-muted">No transactions yet.</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Account transactions, newest first</caption>
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="p-3 font-medium">Date</th>
              <th scope="col" className="p-3 font-medium">Type</th>
              <th scope="col" className="p-3 font-medium">Description</th>
              <th scope="col" className="p-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((t) => (
              <tr key={t.id}>
                <td className="p-3 whitespace-nowrap"><LocalTime iso={t.createdAt} /></td>
                <td className="p-3">
                  <Badge tone={KIND_TONE[t.kind]}>{titleCase(t.kind)}</Badge>
                </td>
                <td className="p-3 text-muted">{t.description ?? (t.kind === "spend" ? "Delivery for the day (updates as ads serve)" : "—")}</td>
                <td className="p-3 text-right tabular-nums">{formatMoney(t.amountMinor, t.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="p-3 text-sm text-danger">{error}</p> : null}
      {cursor ? (
        <div className="p-3">
          <Button variant="secondary" size="sm" onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function lastCompletedMonths(n: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function Statements({ accountId, statements, canGenerate }: { accountId: string; statements: Statement[]; canGenerate: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [month, setMonth] = useState(lastCompletedMonths(1)[0]!);
  const [pending, setPending] = useState(false);
  async function generate() {
    setPending(true);
    try {
      await api("/api/v1/ads-manager/billing/statements", { method: "POST", body: { accountId, month } });
      toast.show("Statement ready");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-4">
      {canGenerate ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs text-muted">
            <span className="block">Month</span>
            <select className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg" value={month} onChange={(e) => setMonth(e.target.value)}>
              {lastCompletedMonths(12).map((m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`))}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={generate} disabled={pending}>
            {pending ? "Preparing…" : "Prepare statement"}
          </Button>
        </div>
      ) : null}
      {statements.length === 0 ? (
        <p className="text-sm text-muted">No statements yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {statements.map((s) => (
            <li key={s.id}>
              <Card className="space-y-3 p-4">
                <p className="flex items-center gap-2 font-medium">
                  <FileText className="size-4 text-muted" aria-hidden="true" /> {s.number}
                </p>
                <p className="text-xs text-muted">
                  Statement of account — not a tax invoice · <LocalTime iso={s.period_start} format="date" /> – <LocalTime iso={s.period_end} format="date" />
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
                  <dt className="text-muted">Opening balance</dt>
                  <dd className="text-right">{formatMoney(s.opening_balance_minor, s.currency)}</dd>
                  <dt className="text-muted">Top-ups</dt>
                  <dd className="text-right">{formatMoney(s.top_ups_minor, s.currency)}</dd>
                  <dt className="text-muted">Spend</dt>
                  <dd className="text-right">{formatMoney(s.spend_minor, s.currency)}</dd>
                  <dt className="text-muted">Adjustments</dt>
                  <dd className="text-right">{formatMoney(s.adjustments_minor, s.currency)}</dd>
                  <dt className="font-medium">Closing balance</dt>
                  <dd className="text-right font-medium">{formatMoney(s.closing_balance_minor, s.currency)}</dd>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
