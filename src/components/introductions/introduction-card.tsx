"use client";

import { ArrowRight, Check, HeartHandshake, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IntroductionStatus, IntroductionView } from "@backend/modules/introductions/service";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

/** Status label for the viewer's role. Requesters never see who declined (the server already hides it). */
export function introductionStatusLabel(status: IntroductionStatus, role: IntroductionView["role"]): { label: string; tone: Tone } {
  switch (status) {
    case "pending":
      return role === "introducer" ? { label: "Waiting for you", tone: "accent" } : { label: "With your introducer", tone: "neutral" };
    case "forwarded":
      return role === "target" ? { label: "Waiting for you", tone: "accent" } : { label: "Introduced — awaiting reply", tone: "accent" };
    case "accepted":
      return { label: "Connected", tone: "success" };
    case "declined":
      return { label: role === "target" ? "You declined" : "You declined to introduce", tone: "neutral" };
    case "unavailable":
      return { label: "Not available right now", tone: "neutral" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "neutral" };
  }
}

/** Which of the three steps (asked → introduced → both agreed) are complete. */
export function introductionStep(status: IntroductionStatus): number {
  if (status === "accepted") return 3;
  if (status === "forwarded") return 2;
  return 1;
}

const STEPS = ["Asked", "Introduced", "Both agreed"];

function Stepper({ status }: { status: IntroductionStatus }) {
  const done = introductionStep(status);
  const closed = status === "declined" || status === "unavailable" || status === "expired" || status === "withdrawn";
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Progress">
      {STEPS.map((label, i) => {
        const complete = i < done;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true" className={cn("h-px w-6 sm:w-10", complete ? "bg-accent" : "bg-border")} /> : null}
            <span className={cn("flex items-center gap-1.5", complete ? "text-fg" : "text-muted", closed && !complete && "line-through opacity-60")}>
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-full border text-[10px]",
                  complete ? "border-accent bg-accent text-accent-fg" : "border-border",
                )}
              >
                {complete ? <Check className="size-3" /> : i + 1}
              </span>
              {label}
              <span className="sr-only">{complete ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function daysLeft(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

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

  const status = introductionStatusLabel(intro.status, intro.role);
  const open = intro.status === "pending" || intro.status === "forwarded";
  const left = daysLeft(intro.expiresAt);
  const showVouches = intro.role !== "requester";

  return (
    <article className="panel space-y-4 p-5">
      <header className="flex flex-wrap items-center gap-3">
        <MemberLink member={intro.requester} size={36} subtitle="wants to meet" />
        <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <MemberLink member={intro.target} size={36} subtitle={`via ${intro.introducer.displayName}`} />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <Badge tone={status.tone}>{status.label}</Badge>
          {formatRelative(intro.updatedAt)}
        </span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper status={intro.status} />
        {open ? <span className="text-xs text-muted">{left > 0 ? `Expires in ${left} day${left === 1 ? "" : "s"}` : "Expires today"}</span> : null}
      </div>

      {showVouches ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <HeartHandshake className="size-3.5 text-accent" aria-hidden="true" />
          {intro.requesterVouches > 0
            ? `${intro.requester.displayName} is vouched for by ${intro.requesterVouches} member${intro.requesterVouches === 1 ? "" : "s"} you can see`
            : `No vouches for ${intro.requester.displayName} that you can see`}
          {intro.requester.handle ? (
            <Link href={`/members/${intro.requester.handle}`} className="text-accent hover:underline">
              View profile
            </Link>
          ) : null}
        </p>
      ) : null}

      <blockquote className="border-l-2 border-border-strong pl-4 text-sm leading-6 whitespace-pre-line">{intro.message}</blockquote>
      {intro.introducerNote ? (
        <p className="rounded-lg bg-surface-2 p-3 text-sm">
          <span className="font-medium">{intro.introducer.displayName}:</span> {intro.introducerNote}
        </p>
      ) : null}

      {intro.role === "introducer" && intro.status === "pending" ? (
        <div className="space-y-3">
          <label htmlFor={`note-${intro.id}`} className="text-xs text-muted">
            Add a note for {intro.target.displayName} (optional). Only they see it.
          </label>
          <Textarea id={`note-${intro.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} className="min-h-20" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-xs text-muted">{intro.requester.displayName} won&apos;t see who declined.</p>
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-xs text-muted">Nothing is shared until you accept. If you decline, they&apos;re only told it isn&apos;t available right now.</p>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "target", accept: false }, "Declined privately")}>
            Not now
          </Button>
          <Button size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/respond`, { as: "target", accept: true }, "You're now connected")}>
            Accept & connect
          </Button>
        </div>
      ) : null}

      {intro.status === "accepted" && intro.conversationId ? (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline">
            <Link href={`/messages/${intro.conversationId}`}>
              <MessageSquare /> Message {intro.role === "requester" ? intro.target.displayName : intro.requester.displayName}
            </Link>
          </Button>
        </div>
      ) : null}

      {intro.role === "requester" && open ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act(`/api/v1/introductions/${intro.id}/withdraw`, undefined, "Request withdrawn")}>
            Withdraw
          </Button>
        </div>
      ) : null}
    </article>
  );
}
