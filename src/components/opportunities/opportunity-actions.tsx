"use client";

import { Check, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { INTEREST_STATUS_LABELS } from "@backend/modules/opportunities/schemas";
import type { InterestStatus, InterestView } from "@backend/modules/opportunities/types";

/** Member side: express interest with a private note, edit while pending, withdraw or renew. */
export function InterestControls({
  opportunityId,
  myInterest,
  myNote,
  canRespond,
}: {
  opportunityId: string;
  myInterest: InterestStatus | null;
  myNote: string | null;
  canRespond: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(myNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/opportunities/${opportunityId}/interest`, { method: "POST", body: { note } });
      toast.show(myInterest && myInterest !== "withdrawn" ? "Note updated" : "Interest sent privately to the poster");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!window.confirm("Withdraw your interest? The poster will no longer see it as active.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/opportunities/${opportunityId}/interest`, { method: "DELETE" });
      toast.show("Interest withdrawn");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  const active = myInterest && myInterest !== "withdrawn";
  return (
    <div className="space-y-3">
      {active ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={myInterest === "declined" ? "neutral" : "success"}>{INTEREST_STATUS_LABELS[myInterest]}</Badge>
          <span className="text-muted">
            {myInterest === "pending"
              ? "The poster can see your interest and note."
              : myInterest === "shortlisted"
                ? "You've been shortlisted. The poster may message you."
                : "The poster has passed on this one."}
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {(!active && canRespond) || myInterest === "pending" ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant={active ? "outline" : "primary"} disabled={busy}>
                {active ? "Edit note" : "I'm interested"}
              </Button>
            </DialogTrigger>
            <DialogContent title={active ? "Edit your note" : "Express interest"} description="Only the poster sees who is interested. Add context so they know why you're a fit.">
              <form onSubmit={submit} className="space-y-4">
                <Field id="interest-note" label="Private note (optional)">
                  {(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={5} />}
                </Field>
                {error ? <Alert tone="error">{error}</Alert> : null}
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Sending…" : active ? "Save note" : "Send privately"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
        {active && myInterest !== "declined" ? (
          <Button variant="ghost" onClick={withdraw} disabled={busy}>
            Withdraw
          </Button>
        ) : null}
        {!active && !canRespond ? <p className="text-sm text-muted">This opportunity is no longer accepting responses.</p> : null}
      </div>
    </div>
  );
}

/** Poster side: open/close, delete. */
export function PosterControls({ opportunityId, status }: { opportunityId: string; status: "open" | "closed" }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function setStatus(next: "open" | "closed") {
    setBusy(true);
    try {
      await api(`/api/v1/opportunities/${opportunityId}/status`, { method: "POST", body: { status: next } });
      toast.show(next === "closed" ? "Opportunity closed" : "Opportunity reopened");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this opportunity and all responses? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/opportunities/${opportunityId}`, { method: "DELETE" });
      toast.show("Opportunity deleted");
      router.push("/opportunities?tab=mine");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/opportunities/${opportunityId}/edit`}>Edit</Link>
      </Button>
      {status === "open" ? (
        <Button variant="outline" size="sm" onClick={() => setStatus("closed")} disabled={busy}>
          Close
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setStatus("open")} disabled={busy}>
          Reopen
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-danger" onClick={remove} disabled={busy}>
        Delete
      </Button>
    </div>
  );
}

/** Poster side: who's interested, with shortlist / decline / message. */
export function InterestList({ opportunityId, interests }: { opportunityId: string; interests: InterestView[] }) {
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function decide(userId: string, status: "pending" | "shortlisted" | "declined") {
    setBusyFor(userId);
    try {
      await api(`/api/v1/opportunities/${opportunityId}/interests`, { method: "POST", body: { userId, status } });
      toast.show(status === "shortlisted" ? "Shortlisted — they've been notified" : status === "declined" ? "Marked as not a fit" : "Moved back to interested");
      router.refresh();
    } catch (err) {
      toast.show(errorMessage(err), "error");
    } finally {
      setBusyFor(null);
    }
  }

  async function message(userId: string) {
    setBusyFor(userId);
    try {
      const { id } = await api<{ id: string }>("/api/v1/conversations", { method: "POST", body: { userId } });
      router.push(`/messages/${id}`);
    } catch (err) {
      toast.show(errorMessage(err), "error");
      setBusyFor(null);
    }
  }

  const active = interests.filter((i) => i.status !== "withdrawn");
  if (active.length === 0) {
    return <EmptyState title="No responses yet" description="Members who express interest will appear here privately. Only you can see them." />;
  }
  return (
    <ul className="divide-y divide-border">
      {active.map((i) => (
        <li key={i.member.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MemberLink member={i.member} size={40} subtitle={`${i.member.headline ?? ""}${i.member.headline ? " · " : ""}${formatRelative(i.createdAt)}`} />
            <Badge tone={i.status === "shortlisted" ? "success" : "neutral"}>{INTEREST_STATUS_LABELS[i.status]}</Badge>
          </div>
          {i.note ? <p className="rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-line">{i.note}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {i.status !== "shortlisted" ? (
              <Button size="sm" variant="outline" disabled={busyFor === i.member.id} onClick={() => decide(i.member.id, "shortlisted")}>
                <Check /> Shortlist
              </Button>
            ) : null}
            {i.status !== "declined" ? (
              <Button size="sm" variant="ghost" disabled={busyFor === i.member.id} onClick={() => decide(i.member.id, "declined")}>
                <X /> Not a fit
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={busyFor === i.member.id} onClick={() => decide(i.member.id, "pending")}>
                Reconsider
              </Button>
            )}
            {i.canMessage ? (
              <Button size="sm" variant="secondary" disabled={busyFor === i.member.id} onClick={() => message(i.member.id)}>
                <MessageSquare /> Message
              </Button>
            ) : (
              <span className="text-xs text-muted">{i.messageBlockedReason}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
