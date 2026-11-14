"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";

type Option = { label: string; body: Record<string, unknown>; variant?: "primary" | "outline" | "danger"; requireNote?: boolean };

/**
 * Staff decision buttons with an optional note. The server re-checks staff rank in SQL and
 * writes the audit log for every decision.
 */
export function ReviewActions({ endpoint, options, noteLabel = "Note (shared with the member when rejecting)" }: { endpoint: string; options: Option[]; noteLabel?: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function decide(o: Option) {
    if (o.requireNote && note.trim().length < 3) {
      toast.show("Please add a short note explaining the decision.", "error");
      return;
    }
    setBusy(true);
    try {
      await api(endpoint, { method: "POST", body: { ...o.body, note: note.trim() || undefined, reason: o.body.reason ?? (note.trim() || undefined) } });
      setDone(o.label);
      toast.show(`${o.label}: done`);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-sm text-muted">Decision recorded: {done}</p>;

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs text-muted">{noteLabel}</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-16" />
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.label} size="sm" variant={o.variant ?? "primary"} disabled={busy} onClick={() => decide(o)}>
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
