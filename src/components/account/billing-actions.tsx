"use client";

import { CreditCard, Lock, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";

const PROVIDER_COPY = {
  stripe: { icon: CreditCard, title: "Card & wallets", detail: "Visa, Mastercard, Amex, Apple Pay, Google Pay and local methods — worldwide" },
  razorpay: { icon: Smartphone, title: "UPI & Indian methods", detail: "UPI, RuPay, Indian cards and netbanking" },
} as const;

/**
 * Payment method choice for one price. Only providers that are configured on the server and have
 * this price set up are passed in, so every option shown can actually take payment.
 */
export function PaymentOptions({
  priceId,
  amountLabel,
  providers,
}: {
  priceId: string;
  amountLabel: string;
  providers: readonly ("stripe" | "razorpay")[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const toast = useToast();
  async function start(provider: "stripe" | "razorpay") {
    setPending(provider);
    try {
      const { url } = await api<{ url: string }>("/api/v1/billing/checkout", { method: "POST", body: { priceId, provider } });
      window.location.assign(url);
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setPending(null);
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{amountLabel}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((id) => {
          const c = PROVIDER_COPY[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => start(id)}
              disabled={pending !== null}
              className="pressable flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-accent/60 disabled:opacity-60"
            >
              <c.icon className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{pending === id ? "Opening secure checkout…" : c.title}</span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <Lock className="size-3" aria-hidden="true" /> Payments are processed by the provider; ELVORA never sees your card details.
      </p>
    </div>
  );
}

export function CancelSubscriptionButton({ subscriptionId }: { subscriptionId: string }) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function cancel() {
    if (!window.confirm("Cancel at the end of the current billing period? You keep access until then.")) return;
    setPending(true);
    try {
      const res = await api<{ pending: boolean }>(`/api/v1/billing/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
      toast.show(res.pending ? "Cancellation requested. It will show here once the payment provider confirms." : "Already set to cancel.");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={cancel} disabled={pending}>
      {pending ? "Requesting…" : "Cancel renewal"}
    </Button>
  );
}

export function WithdrawApplicationButton({ applicationId }: { applicationId: string }) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  async function withdraw() {
    if (!window.confirm("Withdraw this application?")) return;
    setPending(true);
    try {
      await api(`/api/v1/applications/${applicationId}/withdraw`, { method: "POST" });
      toast.show("Application withdrawn");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={withdraw} disabled={pending}>
      Withdraw
    </Button>
  );
}
