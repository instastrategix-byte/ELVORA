"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { IntroductionView } from "@backend/modules/introductions/service";

const STATUS: Record<IntroductionView["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  pending: { label: "Waiting for introducer", tone: "neutral" },
  forwarded: { label: "Introduced", tone: "accent" },
  accepted: { label: "Connected", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** One introduction, with the actions available to the viewer's role and its current status. */
export function IntroductionCard({ intro }: { intro: IntroductionView }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function act(path: string, body?: unknown, done = "Done") {
    setBusy(true);
    try {
      await api(path, { method: "POST", body });
      toast.show(done);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setBusy(false);
    }
  }

  const status = STATUS[intro.status];
  const statusLabel =
    intro.status === "declined" ? (intro.role === "requester" ? (intro.declinedByIntroducer ? "Not forwarded" : "Declined") : "Declined") : status.label;

  return (
    <article className="panel space-y-4 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <MemberLink member={intro.requester} size={36} subtitle="wants to meet" />
        <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <MemberLink member={intro.target} size={36} subtitle={`via ${intro.introducer.displayName}`} />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <Badge tone={status.tone}>{statusLabel}</Badge>
          {formatRelative(intro.updatedAt)}
        </span>
      </header>
      <blockquote className="border-l-2 border-border-strong pl-4 text-sm leading-6 whitespace-pre-line">{intro.message}</blockquote>
      {intro.introducerNote ? (
        <p className="rounded-lg bg-surface-2 p-3 text-sm">
          <span className="font-medium">{intro.introducer.displayName}:</span> {intro.introducerNote}
        </p>
      ) : null}

      {intro.role === "introducer" && intro.status === "pending" ? (
        <div className="space-y-3">
          <label htmlFor={`note-${intro.id}`} className="text-xs text-muted">
            Add a note for {intro.target.displayName} (optional)
          </label>
          <Textarea id={`note-${intro.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} className="min-h-20" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "introducer", accept: false }, "Request declined")}>
              Decline
            </Button>
            <Button size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "introducer", accept: true, note: note || undefined }, "Introduction sent")}>
              Introduce them
            </Button>
          </div>
        </div>
      ) : null}

      {intro.role === "target" && intro.status === "forwarded" ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "target", accept: false }, "Declined")}>
            Not now
          </Button>
          <Button size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "target", accept: true }, "You're now connected")}>
            Accept & connect
          </Button>
        </div>
      ) : null}

      {intro.role === "requester" && (intro.status === "pending" || intro.status === "forwarded") ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/withdraw`, undefined, "Request withdrawn")}>
            Withdraw
          </Button>
        </div>
      ) : null}
    </article>
  );
}
