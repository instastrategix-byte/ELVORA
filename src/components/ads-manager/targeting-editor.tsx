"use client";

import { Users } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import type { AudienceView } from "@backend/modules/advertising/types";
import { MIN_AUDIENCE_SIZE } from "@backend/modules/advertising/constants";
import { BUSINESS_CATEGORIES } from "@backend/modules/listings/schemas";
import { MEMBER_TYPE_LABELS, MEMBER_TYPES } from "@backend/modules/profiles/types";
import { audienceSizeLabel, parseTerms } from "./model";
import type { StepIssues, TargetingDraft } from "./wizard-model";

const TEXT_KEYS = [
  { key: "countries", label: "Countries", hint: "Matched against the member's location, e.g. United Kingdom, UAE" },
  { key: "regions", label: "Regions or states", hint: "e.g. California, Maharashtra" },
  { key: "cities", label: "Cities", hint: "e.g. London, Dubai, Mumbai" },
  { key: "industries", label: "Industries", hint: "Exact industry names, e.g. Finance, Real estate" },
  { key: "job_titles", label: "Job titles", hint: "Partial matches, e.g. Founder, Chief, Partner" },
  { key: "interests", label: "Interests", hint: "Exact interests, e.g. Sailing, Art, Aviation" },
] as const;

/** A comma-separated list that keeps the person's typing until they leave the field. */
function TermsInput({ id, value, onChange, ...aria }: { id: string; value: string[]; onChange: (v: string[]) => void; "aria-invalid": boolean; "aria-describedby"?: string }) {
  const [text, setText] = useState(value.join(", "));
  const joined = value.join(", ");
  const [last, setLast] = useState(joined);
  if (joined !== last) {
    setLast(joined);
    setText(joined);
  }
  return <Textarea id={id} rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(parseTerms(text))} {...aria} />;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/**
 * Targeting is limited to professional and location attributes. Sensitive characteristics
 * (age, gender, religion, health, ethnicity, sexuality, politics) can't be expressed at all —
 * the API and the database reject unknown keys.
 */
export function TargetingEditor({
  accountId,
  value,
  onChange,
  audiences,
  issues,
  showAudiences = true,
}: {
  accountId: string;
  value: TargetingDraft;
  onChange: (next: TargetingDraft) => void;
  audiences: AudienceView[];
  issues?: StepIssues;
  showAudiences?: boolean;
}) {
  const uid = useId();
  const set = (patch: Partial<TargetingDraft>) => onChange({ ...value, ...patch });
  const usable = audiences.filter((a) => !a.requiresIntegration);
  const [estimate, setEstimate] = useState<number | null | undefined>(undefined);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const key = JSON.stringify(value);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setChecking(true);
      api<{ estimate: number | null }>("/api/v1/ads-manager/audiences/estimate", {
        method: "POST",
        body: { accountId, targeting: { ...JSON.parse(key), languages: [] } },
        signal: controller.signal,
      })
        .then((r) => {
          setEstimate(r.estimate);
          setEstimateError(null);
        })
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setEstimateError(errorMessage(e));
        })
        .finally(() => setChecking(false));
    }, 700);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [accountId, key]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        {issues?.targeting ? (
          <p role="alert" className="text-sm text-danger">
            {issues.targeting[0]}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_KEYS.map(({ key: k, label, hint }) => (
            <Field key={k} id={`${uid}-${k}`} label={label} hint={hint}>
              {(a) => <TermsInput {...a} value={value[k]} onChange={(v) => set({ [k]: v } as Partial<TargetingDraft>)} />}
            </Field>
          ))}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Member type</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {MEMBER_TYPES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <Checkbox checked={value.member_types.includes(m)} onChange={() => set({ member_types: toggle(value.member_types, m) })} />
                {MEMBER_TYPE_LABELS[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Business owners by category</legend>
          <p className="text-xs text-muted">Reaches members who own an approved business in these categories.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {BUSINESS_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <Checkbox checked={value.business_types.includes(c)} onChange={() => set({ business_types: toggle(value.business_types, c) })} />
                {titleCase(c)}
              </label>
            ))}
          </div>
        </fieldset>

        {showAudiences ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {(["include_audience_ids", "exclude_audience_ids"] as const).map((k) => (
              <fieldset key={k} className="space-y-2">
                <legend className="text-sm font-medium">{k === "include_audience_ids" ? "Include saved audiences" : "Exclude audiences"}</legend>
                {usable.length === 0 ? (
                  <p className="text-xs text-muted">No audiences yet. Create them under Audiences.</p>
                ) : (
                  usable.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={value[k].includes(a.id)} onChange={() => set({ [k]: toggle(value[k], a.id) } as Partial<TargetingDraft>)} />
                      {a.name} <span className="text-xs text-muted">({titleCase(a.kind)})</span>
                    </label>
                  ))
                )}
              </fieldset>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted">
          Language targeting isn&apos;t available yet (members don&apos;t record a language). Members who have opted out of ad personalisation only see untargeted ads.
        </p>
      </div>

      <aside className="panel space-y-2 p-5 lg:sticky lg:top-24 lg:self-start" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-muted">
          <Users className="size-4" aria-hidden="true" /> Estimated audience
        </p>
        <p className="text-2xl font-semibold">{checking && estimate === undefined ? "Checking…" : audienceSizeLabel(estimate, MIN_AUDIENCE_SIZE)}</p>
        {estimateError ? <p className="text-xs text-danger">{estimateError}</p> : null}
        <p className="text-xs text-muted">Counts active members who match right now, rounded. Sizes under {MIN_AUDIENCE_SIZE} aren&apos;t shown, to protect privacy.</p>
      </aside>
    </div>
  );
}
