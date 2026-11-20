"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdPreview } from "@/components/ads-manager/ad-preview";
import { ReviewBadge } from "@/components/ads-manager/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatMoney, titleCase } from "@/lib/format";
import type { ReviewQueue } from "@backend/modules/advertising/services/reviews";
import { OBJECTIVE_LABELS } from "@backend/modules/advertising/constants";
import { REVIEW_REASONS } from "@backend/modules/advertising/validators";
import { LocalTime } from "@/components/ui/local-time";

type Target =
  | { type: "campaign"; id: string; title: string }
  | { type: "ad"; id: string; title: string }
  | { type: "suspend-campaign"; id: string; title: string }
  | { type: "suspend-account"; id: string; title: string };

function DecisionDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [decision, setDecision] = useState<"approved" | "rejected" | "changes_requested">("approved");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const suspending = target?.type === "suspend-campaign" || target?.type === "suspend-account";

  async function submit() {
    if (!target) return;
    if ((suspending || decision !== "approved") && !reasons.length && !note.trim()) {
      setError("Give the advertiser a reason or a note.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = suspending ? { suspend: true, reasons, note: note || undefined } : { decision, reasons: decision === "approved" ? [] : reasons, note: note || undefined };
      const path =
        target.type === "campaign"
          ? `/api/v1/admin/ads/campaigns/${target.id}/review`
          : target.type === "ad"
            ? `/api/v1/admin/ads/ads/${target.id}/review`
            : target.type === "suspend-campaign"
              ? `/api/v1/admin/ads/campaigns/${target.id}/suspension`
              : `/api/v1/admin/ads/accounts/${target.id}/suspension`;
      await api(path, { method: "POST", body });
      toast.show(suspending ? "Suspended" : `Decision recorded: ${titleCase(decision)}`);
      setReasons([]);
      setNote("");
      setDecision("approved");
      onClose();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && !pending && onClose()}>
      {target ? (
        <DialogContent title={suspending ? `Suspend ${target.type === "suspend-account" ? "account" : "campaign"}` : "Review decision"} description={target.title}>
          <div className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {!suspending ? (
              <Field id="rv-decision" label="Decision">
                {(a) => (
                  <Select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)} {...a}>
                    <option value="approved">Approve</option>
                    <option value="changes_requested">Request changes</option>
                    <option value="rejected">Reject</option>
                  </Select>
                )}
              </Field>
            ) : (
              <Alert tone="warning">Suspension stops delivery immediately. The advertiser is notified and can appeal.</Alert>
            )}
            {suspending || decision !== "approved" ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Reasons</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {REVIEW_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={reasons.includes(r)} onChange={() => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))} />
                      {titleCase(r)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <Field id="rv-note" label="Note to the advertiser" hint="Shown to the advertiser and kept in the audit log.">
              {(a) => <Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} {...a} />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button variant={suspending || decision === "rejected" ? "danger" : "primary"} onClick={submit} disabled={pending}>
                {pending ? "Saving…" : suspending ? "Suspend" : "Record decision"}
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AppealResolver({ appeal }: { appeal: ReviewQueue["appeals"][number] }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  async function resolve(overturn: boolean) {
    setPending(true);
    try {
      await api(`/api/v1/admin/ads/appeals/${appeal.id}/resolve`, { method: "POST", body: { overturn, note: note || undefined } });
      toast.show(overturn ? "Overturned — sent back to review" : "Decision upheld");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <Field id={`ap-${appeal.id}`} label="Resolution note">
        {(a) => <Textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} {...a} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => resolve(false)}>
          Uphold decision
        </Button>
        <Button size="sm" disabled={pending} onClick={() => resolve(true)}>
          Overturn and re-review
        </Button>
      </div>
    </div>
  );
}

export function AdReviewConsole({ queue }: { queue: ReviewQueue }) {
  const [target, setTarget] = useState<Target | null>(null);
  const nothing = !queue.campaigns.length && !queue.ads.length && !queue.appeals.length;
  if (nothing) return <EmptyState title="Nothing waiting for review" description="New campaigns, ads added to running campaigns, and appeals appear here." />;

  return (
    <div className="space-y-10">
      <section aria-labelledby="q-campaigns" className="space-y-4">
        <h2 id="q-campaigns" className="font-medium">
          Campaigns ({queue.campaigns.length})
        </h2>
        {queue.campaigns.map((c) => (
          <Card key={c.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-muted">
                  {c.accountName} · {OBJECTIVE_LABELS[c.objective]} · <LocalTime iso={c.startsOn} format="date" /> – <LocalTime iso={c.endsOn} format="date" /> ·{" "}
                  {c.budgetType === "daily" ? `${formatMoney(c.dailyBudgetMinor, c.currency)}/day` : `${formatMoney(c.totalBudgetMinor, c.currency)} lifetime`}
                </p>
                {c.specialCategory !== "none" ? <Badge tone="warning">Special category: {titleCase(c.specialCategory)}</Badge> : null}
                {c.submittedAt ? <p className="text-xs text-muted">Submitted <LocalTime iso={c.submittedAt} /></p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setTarget({ type: "campaign", id: c.id, title: c.name })}>
                  Decide
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setTarget({ type: "suspend-account", id: c.accountId, title: c.accountName })}>
                  Suspend account
                </Button>
              </div>
            </div>
            {c.ads.length ? (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {c.ads.map((ad) => (
                  <li key={ad.id} className="space-y-2">
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{ad.name}</span> <ReviewBadge status={ad.reviewStatus} />
                    </p>
                    {ad.creative ? (
                      <>
                        <AdPreview creative={ad.creative} advertiser={c.accountName} />
                        {ad.creative.destinationUrl ? (
                          <a href={ad.creative.destinationUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs break-all text-accent hover:underline">
                            {ad.creative.destinationUrl} <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted">Creative unavailable.</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">This campaign has no ads.</p>
            )}
          </Card>
        ))}
      </section>

      <section aria-labelledby="q-ads" className="space-y-4">
        <h2 id="q-ads" className="font-medium">
          Ads added to running campaigns ({queue.ads.length})
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queue.ads.map((ad) => (
            <li key={ad.id}>
              <Card className="space-y-3 p-4">
                <p className="text-sm">
                  <span className="font-medium">{ad.name}</span>
                  <span className="block text-xs text-muted">
                    {ad.accountName} · {ad.campaignName}
                  </span>
                </p>
                {ad.creative ? <AdPreview creative={ad.creative} advertiser={ad.accountName} /> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setTarget({ type: "ad", id: ad.id, title: `${ad.name} · ${ad.campaignName}` })}>
                    Decide
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTarget({ type: "suspend-campaign", id: ad.campaignId, title: ad.campaignName })}>
                    Suspend campaign
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="q-appeals" className="space-y-4">
        <h2 id="q-appeals" className="font-medium">
          Appeals ({queue.appeals.length})
        </h2>
        {queue.appeals.map((a) => (
          <Card key={a.id} className="space-y-3 p-5">
            <p className="text-sm">
              <span className="font-medium">{a.accountName}</span> <span className="text-muted">· <LocalTime iso={a.createdAt} /></span>
            </p>
            {a.review ? (
              <p className="text-sm text-muted">
                Original decision: {titleCase(a.review.decision)} on {a.review.entityType}
                {a.review.reasons.length ? ` — ${a.review.reasons.map(titleCase).join(", ")}` : ""}
                {a.review.note ? ` — “${a.review.note}”` : ""}
              </p>
            ) : null}
            <blockquote className="rounded-xl border-l-2 border-accent bg-surface-2 p-3 text-sm whitespace-pre-line">{a.message}</blockquote>
            <AppealResolver appeal={a} />
          </Card>
        ))}
      </section>

      <DecisionDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
