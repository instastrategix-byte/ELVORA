"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import type { AdSetView, AdView } from "@backend/modules/advertising/types";
import { minorToMajor } from "./model";

function useMutation() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string) {
    if (pending) return;
    setPending(true);
    try {
      await fn();
      toast.show(done);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setPending(false);
    }
  }
  return { pending, run };
}

/** Pause / switch on one ad. Ads still need approval before they serve. */
export function AdControls({ ad, campaignRunning }: { ad: AdView; campaignRunning: boolean }) {
  const m = useMutation();
  const canToggle = ad.status === "active" || ad.status === "paused" || ad.status === "draft";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {campaignRunning && (ad.reviewStatus === "draft" || ad.reviewStatus === "changes_requested" || ad.reviewStatus === "rejected") ? (
        <Button size="sm" variant="secondary" disabled={m.pending} onClick={() => m.run(() => api(`/api/v1/ads-manager/ads/${ad.id}/submit`, { method: "POST" }), "Ad sent for review")}>
          Submit for review
        </Button>
      ) : null}
      {canToggle ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={m.pending}
          onClick={() =>
            m.run(
              () => api(`/api/v1/ads-manager/ads/${ad.id}`, { method: "PATCH", body: { status: ad.status === "active" ? "paused" : "active" } }),
              ad.status === "active" ? "Ad paused" : "Ad switched on",
            )
          }
        >
          {ad.status === "active" ? "Pause" : "Switch on"}
        </Button>
      ) : null}
    </div>
  );
}

/** Pause / switch on an ad set. The update endpoint takes the full ad set, so we resend it unchanged. */
export function AdSetToggle({ set, currency }: { set: AdSetView; currency: string }) {
  const m = useMutation();
  if (set.status === "archived") return null;
  const next = set.status === "active" ? "paused" : "active";
  const body = {
    name: set.name,
    placements: set.placements,
    targeting: { ...set.targeting, languages: [] },
    bidStrategy: set.bidStrategy,
    bidAmount: set.bidMinor === null ? null : minorToMajor(set.bidMinor, currency),
    dailyBudget: set.dailyBudgetMinor === null ? null : minorToMajor(set.dailyBudgetMinor, currency),
    frequencyCapPerDay: set.frequencyCapPerDay,
    startsAt: set.startsAt,
    endsAt: set.endsAt,
    status: next,
  };
  return (
    <Button size="sm" variant="ghost" disabled={m.pending} onClick={() => m.run(() => api(`/api/v1/ads-manager/ad-sets/${set.id}`, { method: "PATCH", body }), next === "paused" ? "Ad set paused" : "Ad set switched on")}>
      {next === "paused" ? "Pause" : "Switch on"}
    </Button>
  );
}

/** Appeal a review decision. One open appeal per decision (enforced in SQL). */
export function AppealButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const action = useAction(() => api(`/api/v1/ads-manager/reviews/${reviewId}/appeal`, { method: "POST", body: { message } }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) return action.setErrors({ message: ["Explain in at least 10 characters"] });
    if ((await action.run()) !== undefined) {
      toast.show("Appeal sent");
      setOpen(false);
      router.refresh();
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Appeal
        </Button>
      </DialogTrigger>
      <DialogContent title="Appeal this decision" description="A different reviewer looks at appeals. If it's overturned, the item goes back into review.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {action.error ? <Alert tone="error">{action.error}</Alert> : null}
          <Field id={`appeal-${reviewId}`} label="Why should this be reconsidered?" required error={action.fieldErrors.message}>
            {(a) => <Textarea rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} {...a} />}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={action.pending}>
              {action.pending ? "Sending…" : "Send appeal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
