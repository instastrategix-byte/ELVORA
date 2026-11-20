"use client";

import { Plus, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { titleCase } from "@/lib/format";
import type { AudienceKind } from "@backend/modules/advertising/constants";
import type { AudienceView } from "@backend/modules/advertising/types";
import { TargetingEditor } from "./targeting-editor";
import { EMPTY_TARGETING, type StepIssues, type TargetingDraft } from "./wizard-model";
import { LocalTime } from "@/components/ui/local-time";

const KIND_LABELS: Record<AudienceKind, string> = {
  saved: "Saved audience",
  exclusion: "Exclusion list",
  engagement: "Engagement audience",
  customer_list: "Customer list",
  website: "Website visitors",
};

const KIND_HELP: Record<AudienceKind, string> = {
  saved: "Reusable targeting by location, industry, job title, member type, business category and interests.",
  exclusion: "Members matching these rules won't see ads from ad sets that exclude this list.",
  engagement: "Members who clicked your ads, or viewed your ELVORA profile, in a recent window.",
  customer_list: "Match your own customer list. Needs a secure matching integration that isn't available yet.",
  website: "People who visited your website. Needs pixel-based audiences, which aren't available yet.",
};

type Editing = {
  id: string | null;
  name: string;
  kind: AudienceKind;
  targeting: TargetingDraft;
  engagement: { source: "page_visitors" | "ad_engagers"; days: number };
};

function definitionText(a: AudienceView): string {
  if (a.requiresIntegration) return "Needs an integration — matches nobody for now";
  if (a.kind === "engagement") {
    const d = a.definition as { source?: string; days?: number };
    return `${d.source === "ad_engagers" ? "Clicked your ads" : "Viewed your profile"} in the last ${d.days ?? "?"} days`;
  }
  const parts = Object.entries(a.definition)
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([k, v]) => `${titleCase(k)}: ${(v as string[]).join(", ")}`);
  return parts.join(" · ") || "All eligible members";
}

export function AudienceManager({ accountId, audiences, canEdit }: { accountId: string; audiences: AudienceView[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [issues, setIssues] = useState<StepIssues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open(a?: AudienceView) {
    setIssues({});
    setError(null);
    setEditing(
      a
        ? {
            id: a.id,
            name: a.name,
            kind: a.kind,
            targeting: { ...EMPTY_TARGETING, ...(a.kind === "saved" || a.kind === "exclusion" ? (a.definition as Partial<TargetingDraft>) : {}) },
            engagement: a.kind === "engagement" ? (a.definition as Editing["engagement"]) : { source: "ad_engagers", days: 30 },
          }
        : { id: null, name: "", kind: "saved", targeting: { ...EMPTY_TARGETING }, engagement: { source: "ad_engagers", days: 30 } },
    );
  }

  async function save() {
    if (!editing) return;
    if (editing.name.trim().length < 1) return setIssues({ name: ["Give the audience a name"] });
    const definition =
      editing.kind === "engagement"
        ? editing.engagement
        : editing.kind === "saved" || editing.kind === "exclusion"
          ? { ...editing.targeting, include_audience_ids: [], exclude_audience_ids: [], languages: [] }
          : {};
    setSaving(true);
    setError(null);
    try {
      if (editing.id) await api(`/api/v1/ads-manager/audiences/${editing.id}`, { method: "PATCH", body: { name: editing.name, definition } });
      else await api("/api/v1/ads-manager/audiences", { method: "POST", body: { accountId, name: editing.name, kind: editing.kind, definition } });
      toast.show(editing.id ? "Audience updated (new version saved)" : "Audience created");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.fieldErrors) setIssues(e.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: AudienceView) {
    if (!window.confirm(`Delete “${a.name}”? Ad sets that use it will no longer include or exclude it.`)) return;
    try {
      await api(`/api/v1/ads-manager/audiences/${a.id}`, { method: "DELETE" });
      toast.show("Audience deleted");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => open()}>
            <Plus /> Create audience
          </Button>
        </div>
      ) : null}
      {audiences.length === 0 ? (
        <EmptyState icon={<Target />} title="No audiences yet" description="Save targeting you use often, build engagement audiences, or create exclusion lists." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {audiences.map((a) => (
            <li key={a.id} className="panel flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted">
                    {KIND_LABELS[a.kind]} · version {a.version} · updated <LocalTime iso={a.updatedAt} format="date" />
                  </p>
                </div>
                {a.requiresIntegration ? <Badge tone="warning">Needs integration</Badge> : null}
              </div>
              <p className="text-sm text-muted">{definitionText(a)}</p>
              {canEdit ? (
                <div className="mt-auto flex gap-2">
                  {!a.requiresIntegration ? (
                    <Button size="sm" variant="secondary" onClick={() => open(a)}>
                      Edit
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? "Edit audience" : "Create audience"} size="lg" className="sm:max-w-4xl">
            <div className="space-y-5">
              {error ? <Alert tone="error">{error}</Alert> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="aud-name" label="Name" required error={issues.name}>
                  {(a) => <Input value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} {...a} />}
                </Field>
                <Field id="aud-kind" label="Type" hint={KIND_HELP[editing.kind]}>
                  {(a) => (
                    <Select value={editing.kind} disabled={editing.id !== null} onChange={(e) => setEditing({ ...editing, kind: e.target.value as AudienceKind })} {...a}>
                      {(Object.keys(KIND_LABELS) as AudienceKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                          {k === "customer_list" || k === "website" ? " (needs integration)" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {editing.kind === "saved" || editing.kind === "exclusion" ? (
                <TargetingEditor accountId={accountId} value={editing.targeting} onChange={(targeting) => setEditing({ ...editing, targeting })} audiences={[]} issues={issues} showAudiences={false} />
              ) : null}
              {editing.kind === "engagement" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="aud-src" label="Source" error={issues.definition}>
                    {(a) => (
                      <Select
                        value={editing.engagement.source}
                        onChange={(e) => setEditing({ ...editing, engagement: { ...editing.engagement, source: e.target.value as Editing["engagement"]["source"] } })}
                        {...a}
                      >
                        <option value="ad_engagers">Members who clicked your ads</option>
                        <option value="page_visitors">Members who viewed the account owner&apos;s profile</option>
                      </Select>
                    )}
                  </Field>
                  <Field id="aud-days" label="Within the last (days)" hint="1–365">
                    {(a) => (
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={editing.engagement.days}
                        onChange={(e) => setEditing({ ...editing, engagement: { ...editing.engagement, days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } })}
                        {...a}
                      />
                    )}
                  </Field>
                </div>
              ) : null}
              {editing.kind === "customer_list" || editing.kind === "website" ? (
                <Alert tone="warning" title="Not available yet">
                  This audience type needs an integration ELVORA doesn&apos;t offer yet. You can save it as a placeholder, but it won&apos;t match anyone, so ad sets that include only
                  this audience won&apos;t deliver.
                </Alert>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save audience"}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
