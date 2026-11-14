"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { advertiserAccountSchema, CAMPAIGN_OBJECTIVES, campaignSchema } from "@backend/modules/ads/schemas";
import type { CampaignView } from "@backend/modules/ads/service";

export function AdvertiserAccountForm({ initial }: { initial: { displayName: string; billingEmail: string | null } | null }) {
  const action = useAction((body: unknown) => api("/api/v1/ads/account", { method: "PUT", body }));
  const router = useRouter();
  const toast = useToast();
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = { displayName: String(f.get("displayName") ?? ""), billingEmail: String(f.get("billingEmail") ?? "") };
    const parsed = advertiserAccountSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues));
    if ((await action.run(parsed.data)) !== undefined) {
      toast.show("Advertiser account saved");
      router.refresh();
    }
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start" noValidate>
      {action.error ? <Alert tone="error" className="sm:col-span-3">{action.error}</Alert> : null}
      <Field id="adv-name" label="Advertiser name" required error={action.fieldErrors.displayName} hint="Shown as “Sponsored · name”.">
        {(a) => <Input name="displayName" defaultValue={initial?.displayName} maxLength={120} {...a} />}
      </Field>
      <Field id="adv-email" label="Billing email" error={action.fieldErrors.billingEmail}>
        {(a) => <Input name="billingEmail" type="email" defaultValue={initial?.billingEmail ?? ""} {...a} />}
      </Field>
      <Button type="submit" className="sm:mt-7" disabled={action.pending}>
        {action.pending ? "Saving…" : initial ? "Save" : "Create account"}
      </Button>
    </form>
  );
}

const toMajor = (minor: number) => minor / 100;

export function CampaignForm({
  campaign,
  listings,
  currencies,
}: {
  campaign?: CampaignView;
  listings: { id: string; title: string }[];
  currencies: string[];
}) {
  const action = useAction((body: unknown) =>
    campaign ? api(`/api/v1/ads/campaigns/${campaign.id}`, { method: "PATCH", body }) : api<{ id: string }>("/api/v1/ads/campaigns", { method: "POST", body }),
  );
  const router = useRouter();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const list = (k: string) =>
      String(f.get(k) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const input = {
      name: String(f.get("name") ?? ""),
      objective: String(f.get("objective") ?? ""),
      currency: String(f.get("currency") ?? ""),
      dailyBudget: Number(f.get("dailyBudget")),
      totalBudget: Number(f.get("totalBudget")),
      startsOn: String(f.get("startsOn") ?? ""),
      endsOn: String(f.get("endsOn") ?? ""),
      headline: String(f.get("headline") ?? ""),
      body: String(f.get("body") ?? "") || undefined,
      destinationUrl: String(f.get("destinationUrl") ?? ""),
      listingId: String(f.get("listingId") ?? "") || null,
      targetLocations: list("targetLocations"),
      targetInterests: list("targetInterests"),
      frequencyCapPerDay: Number(f.get("frequencyCapPerDay") || 3),
    };
    const parsed = campaignSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const result = await action.run(parsed.data);
    if (result === undefined) return;
    toast.show(campaign ? "Campaign updated" : "Draft campaign created");
    router.push(`/ads/campaigns/${campaign?.id ?? (result as { id: string }).id}`);
    router.refresh();
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <h2 className="display text-2xl sm:col-span-2">Campaign</h2>
        <Field id="c-name" label="Internal name" required error={fe.name}>
          {(a) => <Input name="name" defaultValue={campaign?.name} maxLength={120} {...a} />}
        </Field>
        <Field id="c-obj" label="Objective" required>
          {(a) => (
            <Select name="objective" defaultValue={campaign?.objective ?? "awareness"} {...a}>
              {CAMPAIGN_OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {titleCase(o)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <h2 className="display text-2xl sm:col-span-2">Creative</h2>
        <p className="-mt-3 text-sm text-muted sm:col-span-2">Always displayed with a “Sponsored” label.</p>
        <Field id="c-head" label="Headline" required error={fe.headline} className="sm:col-span-2">
          {(a) => <Input name="headline" defaultValue={campaign?.headline} maxLength={90} {...a} />}
        </Field>
        <Field id="c-body" label="Body" error={fe.body} className="sm:col-span-2">
          {(a) => <Textarea name="body" defaultValue={campaign?.body ?? ""} maxLength={280} className="min-h-20" {...a} />}
        </Field>
        <Field id="c-url" label="Destination link" error={fe.destinationUrl} hint="https:// only">
          {(a) => <Input name="destinationUrl" type="url" defaultValue={campaign?.destinationUrl ?? ""} {...a} />}
        </Field>
        <Field id="c-listing" label="…or promote one of your listings">
          {(a) => (
            <Select name="listingId" defaultValue={campaign?.listingId ?? ""} {...a}>
              <option value="">None</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-3">
        <h2 className="display text-2xl sm:col-span-3">Budget & schedule</h2>
        <Field id="c-cur" label="Currency" hint={currencies.length ? undefined : "No rate card is configured yet."}>
          {(a) => (
            <Select name="currency" defaultValue={campaign?.currency ?? currencies[0] ?? "USD"} {...a}>
              {(currencies.length ? currencies : ["USD"]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="c-daily" label="Daily budget" required error={fe.dailyBudget}>
          {(a) => <Input name="dailyBudget" type="number" min={1} step="0.01" defaultValue={campaign ? toMajor(campaign.dailyBudgetMinor) : ""} {...a} />}
        </Field>
        <Field id="c-total" label="Total budget" required error={fe.totalBudget}>
          {(a) => <Input name="totalBudget" type="number" min={1} step="0.01" defaultValue={campaign ? toMajor(campaign.totalBudgetMinor) : ""} {...a} />}
        </Field>
        <Field id="c-start" label="Start date" required error={fe.startsOn}>
          {(a) => <Input name="startsOn" type="date" min={today} defaultValue={campaign?.startsOn ?? today} {...a} />}
        </Field>
        <Field id="c-end" label="End date" required error={fe.endsOn}>
          {(a) => <Input name="endsOn" type="date" min={today} defaultValue={campaign?.endsOn ?? ""} {...a} />}
        </Field>
        <Field id="c-freq" label="Max views per member / day" error={fe.frequencyCapPerDay}>
          {(a) => <Input name="frequencyCapPerDay" type="number" min={1} max={20} defaultValue={campaign?.frequencyCapPerDay ?? 3} {...a} />}
        </Field>
      </Card>
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <h2 className="display text-2xl sm:col-span-2">Audience</h2>
        <p className="-mt-3 text-sm text-muted sm:col-span-2">Targeting uses only the location and interests members put on their own profiles. Leave empty to reach all members.</p>
        <Field id="c-loc" label="Locations" hint="Comma-separated, e.g. Monaco, Dubai">
          {(a) => <Input name="targetLocations" defaultValue={campaign?.targetLocations.join(", ") ?? ""} {...a} />}
        </Field>
        <Field id="c-int" label="Interests" hint="Comma-separated, e.g. yachting, art">
          {(a) => <Input name="targetInterests" defaultValue={campaign?.targetInterests.join(", ") ?? ""} {...a} />}
        </Field>
      </Card>
      <Button type="submit" disabled={action.pending}>
        {action.pending ? "Saving…" : campaign ? "Save changes" : "Create draft"}
      </Button>
    </form>
  );
}

export function CampaignActions({ campaign }: { campaign: CampaignView }) {
  const action = useAction((a: string) => api(`/api/v1/ads/campaigns/${campaign.id}/transition`, { method: "POST", body: { action: a } }));
  const del = useAction(() => api(`/api/v1/ads/campaigns/${campaign.id}`, { method: "DELETE" }));
  const router = useRouter();
  const toast = useToast();
  async function run(a: string, message: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    if ((await action.run(a)) !== undefined) {
      toast.show(message);
      router.refresh();
    }
  }
  const s = campaign.status;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {s === "draft" || s === "rejected" ? <Button onClick={() => run("submit", "Submitted for review")} disabled={action.pending}>Submit for review</Button> : null}
        {s === "pending_review" ? <Button variant="outline" onClick={() => run("withdraw", "Withdrawn to draft")} disabled={action.pending}>Withdraw</Button> : null}
        {s === "active" ? <Button variant="outline" onClick={() => run("pause", "Campaign paused")} disabled={action.pending}>Pause</Button> : null}
        {s === "paused" ? <Button onClick={() => run("resume", "Campaign resumed")} disabled={action.pending}>Resume</Button> : null}
        {s === "active" || s === "paused" ? (
          <Button variant="ghost" onClick={() => run("end", "Campaign ended", "End this campaign permanently?")} disabled={action.pending}>
            End campaign
          </Button>
        ) : null}
        {s === "draft" || s === "rejected" ? (
          <Button
            variant="ghost"
            className="text-danger"
            disabled={del.pending}
            onClick={async () => {
              if (!window.confirm("Delete this draft?")) return;
              if ((await del.run()) !== undefined) {
                toast.show("Campaign deleted");
                router.push("/ads");
              }
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      {action.error ?? del.error ? <Alert tone="error">{action.error ?? del.error}</Alert> : null}
    </div>
  );
}
