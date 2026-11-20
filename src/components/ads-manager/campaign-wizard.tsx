"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PromotableItems } from "@backend/modules/advertising/services/library";
import type { AudienceView, CreativeView } from "@backend/modules/advertising/types";
import {
  AD_OBJECTIVES,
  AD_PLACEMENTS,
  BID_STRATEGIES,
  BID_STRATEGY_LABELS,
  FORMAT_LABELS,
  OBJECTIVE_LABELS,
  PLACEMENT_LABELS,
  SPECIAL_CATEGORIES,
  type AdObjective,
  type AdPlacement,
  type BidStrategy,
} from "@backend/modules/advertising/constants";
import { AdPreview } from "./ad-preview";
import { CreativeEditor } from "./creative-editor";
import { ReviewBadge } from "./badges";
import { TargetingEditor } from "./targeting-editor";
import { adSetBody, campaignBody, creativeBody, emptyCreative, firstIncompleteStep, stepIssues, WIZARD_STEPS, type StepIssues, type WizardDraft } from "./wizard-model";

const OBJECTIVE_HELP: Record<AdObjective, string> = {
  awareness: "Show your brand to as many relevant members as possible.",
  reach: "Reach the most distinct members within your budget.",
  traffic: "Send members to your website or listing.",
  engagement: "Get reactions, comments and shares on a post.",
  leads: "Collect interest from members on your linked page.",
  conversions: "Drive actions on your website, measured with the ELVORA pixel.",
  event_promotion: "Fill an event you're hosting on ELVORA.",
  inquiries: "Get enquiries on a marketplace listing.",
};

const PLACEMENT_HELP: Record<AdPlacement, string> = {
  feed: "Between posts in the home feed.",
  stories: "Full-screen between stories.",
  discover: "In member discovery.",
  marketplace: "In the luxury marketplace.",
  events: "Alongside events.",
  business: "In business discovery.",
  recommendations: "In sponsored recommendations.",
};

type Account = { id: string; displayName: string; currency: string };

export function CampaignWizard({
  account,
  initial,
  audiences,
  creatives,
  promotable,
}: {
  account: Account;
  initial: WizardDraft;
  audiences: AudienceView[];
  creatives: CreativeView[];
  promotable: PromotableItems;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<WizardDraft>(initial);
  const [step, setStep] = useState(() => (initial.campaignId ? firstIncompleteStep(initial) : 0));
  const [issues, setIssues] = useState<StepIssues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState<CreativeView[]>(creatives);
  const base = `/ads-manager/${account.id}`;
  const current = WIZARD_STEPS[step]!;
  const update = (patch: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Saves whatever the current step owns. Returns the updated draft, or null if it couldn't. */
  async function save(d: WizardDraft): Promise<WizardDraft | null> {
    const id = current.id;
    if (id === "objective") {
      if (d.campaignId) await api(`/api/v1/ads-manager/campaigns/${d.campaignId}`, { method: "PATCH", body: campaignBody(d) });
      return d;
    }
    if (id === "budget") {
      if (d.campaignId) {
        await api(`/api/v1/ads-manager/campaigns/${d.campaignId}`, { method: "PATCH", body: campaignBody(d) });
        return d;
      }
      const { id: campaignId } = await api<{ id: string }>("/api/v1/ads-manager/campaigns", { method: "POST", body: { accountId: account.id, ...campaignBody(d) } });
      // Make the draft resumable from the address bar.
      router.replace(`${base}/campaigns/new?campaign=${campaignId}`, { scroll: false });
      return { ...d, campaignId };
    }
    if (id === "audience" || id === "placements" || id === "bidding") {
      if (!d.campaignId) throw new ApiClientError("validation_failed", "Save the budget step first.", 422);
      if (d.adSetId) {
        await api(`/api/v1/ads-manager/ad-sets/${d.adSetId}`, { method: "PATCH", body: adSetBody(d) });
        return d;
      }
      const set = await api<{ id: string }>("/api/v1/ads-manager/ad-sets", { method: "POST", body: { campaignId: d.campaignId, ...adSetBody(d) } });
      return { ...d, adSetId: set.id };
    }
    if (id === "creative") {
      if (!d.adSetId) throw new ApiClientError("validation_failed", "Save the audience step first.", 422);
      let creativeId = d.creativeId;
      let next = d;
      if (d.creativeMode === "new") {
        const created = await api<{ id: string }>("/api/v1/ads-manager/creatives", { method: "POST", body: { accountId: account.id, ...creativeBody(d.creative) } });
        creativeId = created.id;
        const listed = await api<CreativeView[]>(`/api/v1/ads-manager/creatives?accountId=${account.id}`).catch(() => null);
        if (listed) setLibrary(listed);
        next = { ...d, creativeId, creativeMode: "existing" };
      }
      const name = library.find((c) => c.id === creativeId)?.name || d.creative.name || "Ad";
      if (d.adId) {
        await api(`/api/v1/ads-manager/ads/${d.adId}`, { method: "PATCH", body: { creativeId, name } });
        return next;
      }
      const ad = await api<{ id: string }>("/api/v1/ads-manager/ads", { method: "POST", body: { adSetId: d.adSetId, creativeId, name } });
      return { ...next, adId: ad.id };
    }
    return d;
  }

  async function go(delta: 1 | -1) {
    setError(null);
    if (delta === -1) {
      setIssues({});
      setStep((s) => Math.max(0, s - 1));
      return;
    }
    const found = stepIssues(current.id, draft);
    setIssues(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const saved = await save(draft);
      if (saved) {
        setDraft(saved);
        setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.fieldErrors) setIssues(e.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!draft.campaignId) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/v1/ads-manager/campaigns/${draft.campaignId}/actions`, { method: "POST", body: { action: "submit" } });
      toast.show("Submitted for review");
      router.push(`${base}/campaigns/${draft.campaignId}`);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const selectedCreative = library.find((c) => c.id === draft.creativeId);

  return (
    <div className="space-y-6">
      <nav aria-label="Campaign setup steps">
        <ol className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {WIZARD_STEPS.map((s, i) => {
            const done = i < step;
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => i < step && setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                    i === step ? "border-accent text-fg" : done ? "border-border text-fg hover:border-border-strong" : "border-border text-muted",
                  )}
                >
                  <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px]", done ? "bg-accent text-accent-fg" : "bg-surface-2")}>
                    {done ? <Check className="size-3" aria-hidden="true" /> : i + 1}
                  </span>
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card className="space-y-6 p-5 sm:p-6">
        <div>
          <p className="eyebrow">
            Step {step + 1} of {WIZARD_STEPS.length}
          </p>
          <h2 className="display mt-1 text-2xl">{current.label}</h2>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}

        {current.id === "objective" ? (
          <div className="space-y-5">
            <Field id="wz-name" label="Campaign name" required error={issues.name}>
              {(a) => <Input value={draft.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. Spring villa collection" {...a} />}
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">What do you want to achieve?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {AD_OBJECTIVES.map((o) => (
                  <label
                    key={o}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                      draft.objective === o ? "border-accent bg-accent/5" : "border-border hover:border-border-strong",
                    )}
                  >
                    <input type="radio" name="objective" className="mt-1 accent-[var(--accent)]" checked={draft.objective === o} onChange={() => update({ objective: o })} />
                    <span>
                      <span className="block font-medium">{OBJECTIVE_LABELS[o]}</span>
                      <span className="block text-sm text-muted">{OBJECTIVE_HELP[o]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {current.id === "budget" ? (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Budget type</legend>
              <div className="flex flex-wrap gap-3">
                {(["daily", "lifetime"] as const).map((t) => (
                  <label key={t} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm", draft.budgetType === t ? "border-accent" : "border-border")}>
                    <input type="radio" name="budgetType" className="accent-[var(--accent)]" checked={draft.budgetType === t} onChange={() => update({ budgetType: t })} />
                    {t === "daily" ? "Daily budget" : "Lifetime budget"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              {draft.budgetType === "daily" ? (
                <Field id="wz-daily" label={`Daily budget (${account.currency})`} required error={issues.dailyBudget}>
                  {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.dailyBudget} onChange={(e) => update({ dailyBudget: e.target.value })} {...a} />}
                </Field>
              ) : null}
              <Field
                id="wz-total"
                label={`${draft.budgetType === "daily" ? "Total budget" : "Lifetime budget"} (${account.currency})`}
                required={draft.budgetType === "lifetime"}
                hint={draft.budgetType === "daily" ? "Optional. Defaults to daily × number of days." : undefined}
                error={issues.totalBudget}
              >
                {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.totalBudget} onChange={(e) => update({ totalBudget: e.target.value })} {...a} />}
              </Field>
              <Field id="wz-cap" label={`Spend cap (${account.currency})`} hint="Optional hard stop for this campaign." error={issues.spendCap}>
                {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.spendCap} onChange={(e) => update({ spendCap: e.target.value })} {...a} />}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="wz-start" label="Start date" required error={issues.startsOn}>
                {(a) => <Input type="date" value={draft.startsOn} onChange={(e) => update({ startsOn: e.target.value })} {...a} />}
              </Field>
              <Field id="wz-end" label="End date" required error={issues.endsOn}>
                {(a) => <Input type="date" value={draft.endsOn} min={draft.startsOn} onChange={(e) => update({ endsOn: e.target.value })} {...a} />}
              </Field>
            </div>
            <Field
              id="wz-special"
              label="Special ad category"
              hint="Ads about jobs, housing, credit or financial products get stricter review and can't use narrow targeting."
              error={issues.specialCategory}
            >
              {(a) => (
                <Select value={draft.specialCategory} onChange={(e) => update({ specialCategory: e.target.value as WizardDraft["specialCategory"] })} {...a}>
                  {SPECIAL_CATEGORIES.map((s) => (
                    <option key={s} value={s}>
                      {s === "none" ? "None" : titleCase(s)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="text-xs text-muted">Budgets are enforced by the delivery engine: ads stop when a daily, lifetime, spend cap or account limit is reached, or when the prepaid balance runs out.</p>
          </div>
        ) : null}

        {current.id === "audience" ? (
          <TargetingEditor accountId={account.id} value={draft.targeting} onChange={(targeting) => update({ targeting })} audiences={audiences} issues={issues} />
        ) : null}

        {current.id === "placements" ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Where should your ads appear?</legend>
            {issues.placements ? (
              <p role="alert" className="text-sm text-danger">
                {issues.placements[0]}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {AD_PLACEMENTS.map((p) => (
                <label key={p} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", draft.placements.includes(p) ? "border-accent bg-accent/5" : "border-border")}>
                  <Checkbox
                    className="mt-1"
                    checked={draft.placements.includes(p)}
                    onChange={() => update({ placements: draft.placements.includes(p) ? draft.placements.filter((x) => x !== p) : [...draft.placements, p] })}
                  />
                  <span>
                    <span className="block font-medium">{PLACEMENT_LABELS[p]}</span>
                    <span className="block text-sm text-muted">{PLACEMENT_HELP[p]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {current.id === "bidding" ? (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Bid strategy</legend>
              <div className="space-y-2">
                {BID_STRATEGIES.map((b) => (
                  <label key={b} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm", draft.bidStrategy === b ? "border-accent" : "border-border")}>
                    <input type="radio" name="bid" className="accent-[var(--accent)]" checked={draft.bidStrategy === b} onChange={() => update({ bidStrategy: b as BidStrategy })} />
                    {BID_STRATEGY_LABELS[b]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              {draft.bidStrategy !== "lowest_cost" ? (
                <Field
                  id="wz-bid"
                  label={`${draft.bidStrategy === "cpc_cap" ? "Max cost per click" : draft.bidStrategy === "cpm_cap" ? "Max cost per 1,000 impressions" : "Target cost per result"} (${account.currency})`}
                  required
                  error={issues.bidAmount}
                >
                  {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.bidAmount} onChange={(e) => update({ bidAmount: e.target.value })} {...a} />}
                </Field>
              ) : null}
              <Field id="wz-setbudget" label={`Ad set daily limit (${account.currency})`} hint="Optional." error={issues.dailyBudget}>
                {(a) => <Input type="number" inputMode="decimal" min={0} step="0.01" value={draft.adSetDailyBudget} onChange={(e) => update({ adSetDailyBudget: e.target.value })} {...a} />}
              </Field>
              <Field id="wz-freq" label="Frequency cap" hint="Most times one member sees these ads per day (1–20)." error={issues.frequencyCapPerDay}>
                {(a) => (
                  <Input type="number" min={1} max={20} step={1} value={draft.frequencyCapPerDay} onChange={(e) => update({ frequencyCapPerDay: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} {...a} />
                )}
              </Field>
            </div>
            {draft.bidStrategy === "cpa_target" ? (
              <Alert tone="info">Cost-per-result targets are recorded for reporting, but delivery is billed per 1,000 impressions until conversion optimisation is available.</Alert>
            ) : null}
          </div>
        ) : null}

        {current.id === "creative" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Creative source">
              {(["new", "existing"] as const).map((m) => (
                <label key={m} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm", draft.creativeMode === m ? "border-accent" : "border-border")}>
                  <input
                    type="radio"
                    name="creativeMode"
                    className="accent-[var(--accent)]"
                    checked={draft.creativeMode === m}
                    disabled={m === "existing" && library.length === 0}
                    onChange={() => update(m === "new" ? { creativeMode: m, creative: draft.creative.name ? draft.creative : emptyCreative() } : { creativeMode: m })}
                  />
                  {m === "new" ? "Create a new creative" : `Use one from your library (${library.length})`}
                </label>
              ))}
            </div>
            {draft.creativeMode === "new" ? (
              <CreativeEditor
                accountId={account.id}
                value={draft.creative}
                onChange={(creative) => update({ creative })}
                promotable={promotable}
                issues={issues}
                placements={draft.placements}
                advertiser={account.displayName}
              />
            ) : (
              <fieldset className="space-y-3">
                <legend className="sr-only">Choose a creative</legend>
                {issues.creativeId ? (
                  <p role="alert" className="text-sm text-danger">
                    {issues.creativeId[0]}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {library.map((c) => (
                    <label key={c.id} className={cn("cursor-pointer space-y-2 rounded-2xl border p-3", draft.creativeId === c.id ? "border-accent bg-accent/5" : "border-border")}>
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <input type="radio" name="creativeId" className="accent-[var(--accent)]" checked={draft.creativeId === c.id} onChange={() => update({ creativeId: c.id })} />
                          <span className="truncate font-medium">{c.name}</span>
                        </span>
                        <ReviewBadge status={c.reviewStatus} />
                      </span>
                      <AdPreview creative={c} advertiser={account.displayName} placement="marketplace" />
                      <span className="block text-xs text-muted">{FORMAT_LABELS[c.format]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        ) : null}

        {current.id === "review" ? (
          <div className="space-y-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Campaign</dt>
                <dd className="font-medium">{draft.name}</dd>
                <dd>{OBJECTIVE_LABELS[draft.objective]}</dd>
              </div>
              <div>
                <dt className="text-muted">Budget and schedule</dt>
                <dd>
                  {draft.budgetType === "daily" ? `${draft.dailyBudget} ${account.currency} per day` : `${draft.totalBudget} ${account.currency} lifetime`}
                  {draft.spendCap ? ` · cap ${draft.spendCap} ${account.currency}` : ""}
                </dd>
                <dd>
                  {formatDate(draft.startsOn)} – {formatDate(draft.endsOn)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Placements</dt>
                <dd>{draft.placements.map((p) => PLACEMENT_LABELS[p]).join(", ")}</dd>
              </div>
              <div>
                <dt className="text-muted">Bidding</dt>
                <dd>
                  {BID_STRATEGY_LABELS[draft.bidStrategy]}
                  {draft.bidStrategy !== "lowest_cost" ? ` · ${draft.bidAmount} ${account.currency}` : ""} · up to {draft.frequencyCapPerDay}/day per member
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Targeting</dt>
                <dd>
                  {Object.entries(draft.targeting)
                    .filter(([, v]) => v.length)
                    .map(([k, v]) => (k.endsWith("audience_ids") ? `${titleCase(k)}: ${v.length}` : `${titleCase(k)}: ${v.join(", ")}`))
                    .join(" · ") || "All eligible members"}
                </dd>
              </div>
            </dl>
            {selectedCreative ? (
              <div className="max-w-md space-y-2">
                <p className="flex items-center gap-2 text-sm text-muted">
                  Creative <Badge>{FORMAT_LABELS[selectedCreative.format]}</Badge>
                </p>
                <AdPreview creative={selectedCreative} advertiser={account.displayName} placement={draft.placements[0] ?? "feed"} />
              </div>
            ) : null}
            <Alert tone="info" title="What happens next">
              Our team reviews the campaign and its ads, usually within one business day. Nothing is served or charged until it&apos;s approved. You&apos;ll get a notification with
              the decision.
            </Alert>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <Button type="button" variant="ghost" onClick={() => go(-1)} disabled={step === 0 || saving}>
            <ChevronLeft /> Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {draft.campaignId ? (
              <Button type="button" variant="secondary" onClick={() => router.push(`${base}/campaigns/${draft.campaignId}`)} disabled={saving}>
                Exit (saved steps are kept)
              </Button>
            ) : null}
            {current.id === "review" ? (
              <Button type="button" onClick={submit} disabled={saving || Object.keys(stepIssues("review", draft)).length > 0}>
                {saving ? "Submitting…" : "Submit for review"}
              </Button>
            ) : (
              <Button type="button" onClick={() => go(1)} disabled={saving}>
                {saving ? "Saving…" : "Save and continue"} <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
