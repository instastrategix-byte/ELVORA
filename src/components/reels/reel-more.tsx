"use client";

import { Check, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { ReportButton } from "@/components/social/report-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import type { ReelView } from "@backend/modules/reels/types";

/** Copy link, report, or (for the author) delete. */
export function ReelMoreSheet({ reel, onClose, onDeleted }: { reel: ReelView; onClose: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(`/reels/${reel.id}`, window.location.origin).toString());
      setCopied(true);
    } catch {
      setError("Couldn't copy the link.");
    }
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/v1/reels/${reel.id}`, { method: "DELETE" });
      toast.show("Reel deleted");
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  }

  const row = "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2";
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent title="Reel options">
        <div className="space-y-1">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="button" onClick={copyLink} className={row}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />} {copied ? "Link copied" : "Copy link"}
          </button>
          {!reel.isOwn ? <ReportButton targetType="reel" targetId={reel.id} variant="menu" /> : null}
          {reel.isOwn ? (
            confirming ? (
              <div className="space-y-3 rounded-xl border border-danger/40 p-3">
                <p className="text-sm">Delete this reel? Its likes, comments and video are removed permanently.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" onClick={remove} disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={`${row} text-danger`}>
                <Trash2 className="size-4" aria-hidden="true" /> Delete reel
              </button>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
