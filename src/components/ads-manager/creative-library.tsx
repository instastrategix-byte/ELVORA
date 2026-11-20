"use client";

import { ImageIcon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import type { PromotableItems } from "@backend/modules/advertising/services/library";
import type { CreativeView } from "@backend/modules/advertising/types";
import { FORMAT_LABELS } from "@backend/modules/advertising/constants";
import { AdPreview } from "./ad-preview";
import { ReviewBadge } from "./badges";
import { CreativeEditor } from "./creative-editor";
import { creativeBody, emptyCreative, stepIssues, newDraft, type CreativeDraft, type StepIssues } from "./wizard-model";
import { LocalTime } from "@/components/ui/local-time";

function toDraft(c: CreativeView): CreativeDraft {
  return {
    name: c.name,
    format: c.format,
    primaryText: c.primaryText ?? "",
    headline: c.headline ?? "",
    description: c.description ?? "",
    cta: c.cta,
    destinationUrl: c.destinationUrl ?? "",
    urlParams: c.urlParams ?? "",
    media: c.media.map((m) => ({ ...m, previewUrl: m.url })),
    postId: c.postId,
    listingId: c.listingId,
    eventId: c.eventId,
    businessId: c.businessId,
  };
}

export function CreativeLibrary({
  account,
  creatives,
  promotable,
  canEdit,
}: {
  account: { id: string; displayName: string };
  creatives: CreativeView[];
  promotable: PromotableItems;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: string | null; draft: CreativeDraft; approved: boolean } | null>(null);
  const [issues, setIssues] = useState<StepIssues>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    const found = stepIssues("creative", { ...newDraft(), creativeMode: "new", creative: editing.draft });
    setIssues(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      if (editing.id) await api(`/api/v1/ads-manager/creatives/${editing.id}`, { method: "PATCH", body: creativeBody(editing.draft) });
      else await api("/api/v1/ads-manager/creatives", { method: "POST", body: { accountId: account.id, ...creativeBody(editing.draft) } });
      toast.show(editing.id ? (editing.approved ? "Saved — sent back to review" : "Creative saved") : "Creative created");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError && e.fieldErrors) setIssues(e.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: CreativeView) {
    if (!window.confirm(`Delete “${c.name}”? This can't be undone.`)) return;
    try {
      await api(`/api/v1/ads-manager/creatives/${c.id}`, { method: "DELETE" });
      toast.show("Creative deleted");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <section aria-labelledby="library" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="library" className="font-medium">
          Creative library
        </h2>
        {canEdit ? (
          <Button size="sm" onClick={() => (setIssues({}), setError(null), setEditing({ id: null, draft: emptyCreative(), approved: false }))}>
            <Plus /> New creative
          </Button>
        ) : null}
      </div>
      {creatives.length === 0 ? (
        <EmptyState icon={<ImageIcon />} title="No creatives yet" description="Upload images or video, write your copy and preview it in each placement." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {creatives.map((c) => (
            <li key={c.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {FORMAT_LABELS[c.format]} · updated <LocalTime iso={c.updatedAt} format="date" />
                  </p>
                </div>
                <ReviewBadge status={c.reviewStatus} />
              </div>
              <AdPreview creative={c} advertiser={account.displayName} placement="marketplace" />
              {c.reviewNote ? <p className="text-xs text-muted">Reviewer: {c.reviewNote}</p> : null}
              {canEdit ? (
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => (setIssues({}), setError(null), setEditing({ id: c.id, draft: toDraft(c), approved: c.reviewStatus === "approved" }))}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)}>
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
          <DialogContent title={editing.id ? "Edit creative" : "New creative"} size="lg" className="sm:max-w-5xl">
            <div className="space-y-5">
              {editing.approved ? (
                <Alert tone="warning" title="This creative is approved">
                  Saving changes sends it — and every ad that uses it — back to review. Those ads stop serving until they&apos;re approved again.
                </Alert>
              ) : null}
              {error ? <Alert tone="error">{error}</Alert> : null}
              <CreativeEditor
                accountId={account.id}
                value={editing.draft}
                onChange={(draft) => setEditing((e) => (e ? { ...e, draft } : e))}
                promotable={promotable}
                issues={issues}
                advertiser={account.displayName}
                placements={["feed", "stories", "marketplace"]}
              />
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save creative"}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
