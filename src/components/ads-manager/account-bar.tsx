"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/primitives";
import { formatMoney, titleCase } from "@/lib/format";
import type { AdAccount } from "@backend/modules/advertising/types";

/** Account switcher, role and balance. Purely presentational; data comes from the server. */
export function AccountBar({ account, accounts }: { account: AdAccount; accounts: AdAccount[] }) {
  const router = useRouter();
  const lowBalance = account.billingMode === "prepaid" && account.balanceMinor <= 0;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {accounts.length > 1 ? (
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="sr-only">Advertising account</span>
            <select
              className="h-9 min-w-0 max-w-64 truncate rounded-lg border border-border bg-surface-2 px-3 text-sm font-medium"
              value={account.id}
              onChange={(e) => router.push(`/ads-manager/${e.target.value}`)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="truncate font-medium">{account.displayName}</p>
        )}
        {account.role ? <Badge>{titleCase(account.role)}</Badge> : null}
        {account.status === "suspended" ? <Badge tone="danger">Suspended</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {account.billingStatus === "payment_failed" ? <Badge tone="danger">Payment failed</Badge> : null}
        {account.billingMode === "prepaid" ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
            <span className="text-muted">Balance</span>
            <span className={lowBalance ? "font-semibold text-danger" : "font-semibold"}>{formatMoney(account.balanceMinor, account.currency)}</span>
          </span>
        ) : (
          <Badge>Billed by subscription</Badge>
        )}
      </div>
    </div>
  );
}
