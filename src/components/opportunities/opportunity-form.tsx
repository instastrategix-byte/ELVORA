"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { toMinorUnits } from "@/lib/format";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { KINDS_WITH_AMOUNT, OPPORTUNITY_KIND_LABELS, OPPORTUNITY_KINDS, opportunitySchema, type OpportunityKind } from "@backend/modules/opportunities/schemas";
import type { OpportunityDetail } from "@backend/modules/opportunities/types";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "CHF", "SGD", "INR", "HKD", "JPY", "CAD", "AUD"];

const toMajor = (minor: number | null, currency: string | null) => (minor == null || !currency ? "" : String(minor / toMinorUnits(1, currency)));

export function OpportunityForm({ opportunity }: { opportunity?: OpportunityDetail }) {
  const [kind, setKind] = useState<OpportunityKind>(opportunity?.kind ?? "partnership");
  const action = useAction((body: unknown) =>
    opportunity
      ? api<{ id: string }>(`/api/v1/opportunities/${opportunity.id}`, { method: "PATCH", body })
      : api<{ id: string }>("/api/v1/opportunities", { method: "POST", body }),
  );
  const router = useRouter();
  const toast = useToast();
  const showAmount = KINDS_WITH_AMOUNT.includes(kind);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const currency = String(f.get("currency") ?? "");
    const num = (name: string) => {
      const raw = String(f.get(name) ?? "").replace(/,/g, "").trim();
      if (!raw || !showAmount) return null;
      const n = Number(raw);
      return Number.isFinite(n) && currency ? toMinorUnits(n, currency) : Number.NaN;
    };
    const input = {
      kind,
      title: String(f.get("title") ?? ""),
      summary: String(f.get("summary") ?? ""),
      details: String(f.get("details") ?? ""),
      industry: String(f.get("industry") ?? ""),
      location: String(f.get("location") ?? ""),
      remote: f.get("remote") === "on",
      visibility: String(f.get("visibility") ?? "members"),
      amountMinMinor: num("amountMin"),
      amountMaxMinor: num("amountMax"),
      currency: showAmount ? currency : null,
      expiresInDays: Number(f.get("expiresInDays") ?? 60),
    };
    const parsed = opportunitySchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const result = await action.run(parsed.data);
    if (result === undefined) return;
    toast.show(opportunity ? "Opportunity updated" : "Opportunity posted");
    router.push(`/opportunities/${result.id}`);
    router.refresh();
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <fieldset disabled={action.pending} className="space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <Field id="o-kind" label="Type" required className="sm:col-span-2">
            {(a) => (
              <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as OpportunityKind)} {...a}>
                {OPPORTUNITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {OPPORTUNITY_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="o-title" label="Title" required error={fe.title} className="sm:col-span-2" hint="e.g. “Raising a $3M seed for a hospitality platform”">
            {(a) => <Input name="title" defaultValue={opportunity?.title} maxLength={120} {...a} />}
          </Field>
          <Field id="o-summary" label="Summary" error={fe.summary} className="sm:col-span-2" hint="One line shown on the board.">
            {(a) => <Input name="summary" defaultValue={opportunity?.summary ?? ""} maxLength={280} {...a} />}
          </Field>
          <Field id="o-details" label="Details" error={fe.details} className="sm:col-span-2" hint="What you're looking for, timeline, and who's a good fit.">
            {(a) => <Textarea name="details" defaultValue={opportunity?.details ?? ""} maxLength={4000} rows={7} {...a} />}
          </Field>
          <Field id="o-industry" label="Industry" error={fe.industry}>
            {(a) => <Input name="industry" defaultValue={opportunity?.industry ?? ""} maxLength={60} {...a} />}
          </Field>
          <Field id="o-location" label="Location" error={fe.location}>
            {(a) => <Input name="location" defaultValue={opportunity?.location ?? ""} maxLength={120} {...a} />}
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox name="remote" defaultChecked={opportunity?.remote ?? false} /> Open to remote
          </label>
        </Card>

        {showAmount ? (
          <Card className="grid gap-5 p-6 sm:grid-cols-3">
            <h2 className="display text-2xl sm:col-span-3">Amount (optional)</h2>
            <Field id="o-currency" label="Currency" error={fe.currency}>
              {(a) => (
                <Select name="currency" defaultValue={opportunity?.currency ?? "USD"} {...a}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="o-min" label="From" error={fe.amountMinMinor}>
              {(a) => (
                <Input name="amountMin" inputMode="decimal" defaultValue={toMajor(opportunity?.amountMinMinor ?? null, opportunity?.currency ?? null)} placeholder="500000" {...a} />
              )}
            </Field>
            <Field id="o-max" label="To" error={fe.amountMaxMinor}>
              {(a) => (
                <Input name="amountMax" inputMode="decimal" defaultValue={toMajor(opportunity?.amountMaxMinor ?? null, opportunity?.currency ?? null)} placeholder="2000000" {...a} />
              )}
            </Field>
          </Card>
        ) : null}

        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <h2 className="display text-2xl sm:col-span-2">Audience</h2>
          <Field id="o-vis" label="Who can see it" hint="Interest is always private: only you see who responds.">
            {(a) => (
              <Select name="visibility" defaultValue={opportunity?.visibility ?? "members"} {...a}>
                <option value="members">All members</option>
                <option value="connections">My connections only</option>
              </Select>
            )}
          </Field>
          <Field id="o-exp" label="Open for" error={fe.expiresInDays}>
            {(a) => (
              <Select name="expiresInDays" defaultValue="60" {...a}>
                <option value="14">2 weeks</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
                <option value="180">6 months</option>
              </Select>
            )}
          </Field>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit">{action.pending ? "Saving…" : opportunity ? "Save changes" : "Post opportunity"}</Button>
        </div>
      </fieldset>
    </form>
  );
}
