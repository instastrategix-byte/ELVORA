"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";

/** Starts hosted checkout. The plan only activates after the provider's webhook confirms payment. */
export function CheckoutButton({ priceId, label, provider }: { priceId: string; label: string; provider?: "stripe" | "razorpay" }) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  async function start() {
    setPending(true);
    try {
      const { url } = await api<{ url: string }>("/api/v1/billing/checkout", { method: "POST", body: { priceId, provider } });
      window.location.assign(url);
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setPending(false);
    }
  }
  return (
    <Button size="sm" onClick={start} disabled={pending}>
      {pending ? "Redirecting to secure checkout…" : label}
    </Button>
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
