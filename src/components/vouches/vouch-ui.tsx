"use client";

import { HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Avatar, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { RELATIONSHIP_LABELS, VOUCH_NOTE_MAX, VOUCH_RELATIONSHIPS, vouchSummary, type VouchRelationship } from "@backend/modules/vouches/constants";
import type { IncomingVouchRequest, ProfileVouches, ReceivedVouch, GivenVouch, SentVouchRequest } from "@backend/modules/vouches/service";

/** Runs a mutation, toasts the outcome and refreshes server data. */
function useMutation() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, init: { method: "POST" | "PATCH" | "DELETE"; body?: unknown }, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api(path, init);
      toast.show(done);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

function RelationshipFields({
  idPrefix,
  relationship,
  setRelationship,
  note,
  setNote,
}: {
  idPrefix: string;
  relationship: VouchRelationship;
  setRelationship: (r: VouchRelationship) => void;
  note: string;
  setNote: (n: string) => void;
}) {
  return (
    <>
      <Field id={`${idPrefix}-rel`} label="How do you know them?" required>
        {(aria) => (
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value as VouchRelationship)} {...aria}>
            {VOUCH_RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {RELATIONSHIP_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id={`${idPrefix}-note`} label="A line about them (optional)" hint={`${note.trim().length}/${VOUCH_NOTE_MAX} · Shown on their profile with your name.`}>
        {(aria) => <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={VOUCH_NOTE_MAX} className="min-h-20" {...aria} />}
      </Field>
    </>
  );
}

/** "Vouch" on a connection's profile, or "Withdraw vouch" if the viewer already vouches. */
export function VouchButton({ voucheeId, name, existingVouchId }: { voucheeId: string; name: string; existingVouchId: string | null }) {
  const [open, setOpen] = useState(false);
  const [relationship, setRelationship] = useState<VouchRelationship>("worked_together");
  const [note, setNote] = useState("");
  const m = useMutation();

  if (existingVouchId) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={m.busy}
        onClick={() => m.run(`/api/v1/vouches/${existingVouchId}`, { method: "DELETE" }, "Vouch withdrawn")}
        title="You vouch for this member. Select to withdraw."
      >
        <ShieldCheck /> You vouch
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HeartHandshake /> Vouch
        </Button>
      </DialogTrigger>
      <DialogContent title={`Vouch for ${name}`} description="Your name appears on their profile. You can vouch for up to 10 members a month and withdraw any time.">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await m.run("/api/v1/vouches", { method: "POST", body: { voucheeId, relationship, note: note || undefined } }, `You now vouch for ${name}`)) setOpen(false);
          }}
        >
          <RelationshipFields idPrefix="vouch" relationship={relationship} setRelationship={setRelationship} note={note} setNote={setNote} />
          {m.error ? <Alert tone="error">{m.error}</Alert> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={m.busy}>
              {m.busy ? "Saving…" : "Vouch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ask a connection to vouch for you. */
export function AskForVouchButton({ voucherId, name }: { voucherId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const m = useMutation();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Ask for a vouch
        </Button>
      </DialogTrigger>
      <DialogContent title={`Ask ${name} to vouch for you`} description="They decide privately. You can ask each member once a month.">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await m.run("/api/v1/vouches/requests", { method: "POST", body: { voucherId, message: message || undefined } }, "Request sent")) setOpen(false);
          }}
        >
          <Field id="ask-vouch-msg" label="Message (optional)" hint={`${message.trim().length}/400`}>
            {(aria) => <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={400} className="min-h-20" {...aria} />}
          </Field>
          {m.error ? <Alert tone="error">{m.error}</Alert> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={m.busy}>
              {m.busy ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Vouched for by …" on a profile, with a dialog listing every vouch the viewer may see. */
export function ProfileVouchesCard({ vouches, name }: { vouches: ProfileVouches; name: string }) {
  if (vouches.total === 0) return null;
  const shown = vouches.items.slice(0, 4);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="panel flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-accent focus-visible:border-accent"
          aria-label={`${vouchSummary(
            vouches.items.map((v) => v.voucher.displayName),
            vouches.total,
          )}. Show all.`}
        >
          <span className="flex -space-x-2" aria-hidden="true">
            {shown.map((v) => (
              <Avatar key={v.id} src={v.voucher.avatarUrl} name={v.voucher.displayName} size={28} className="ring-2 ring-surface" />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <HeartHandshake className="size-4 text-accent" aria-hidden="true" /> Vouched for by {vouches.total} member{vouches.total === 1 ? "" : "s"}
            </span>
            <span className="block truncate text-xs text-muted">
              {vouchSummary(
                vouches.items.map((v) => v.voucher.displayName),
                vouches.total,
              )}
            </span>
          </span>
        </button>
      </DialogTrigger>
      <DialogContent title={`Who vouches for ${name}`} description="Members who know them and chose to say so publicly.">
        <ul className="space-y-4">
          {vouches.items.map((v) => (
            <li key={v.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <MemberLink member={v.voucher} size={36} subtitle={RELATIONSHIP_LABELS[v.relationship]} />
                <span className="shrink-0 text-xs text-muted">{formatRelative(v.createdAt)}</span>
              </div>
              {v.note ? <p className="border-l-2 border-border-strong pl-3 text-sm">{v.note}</p> : null}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function IncomingRequestCard({ request }: { request: IncomingVouchRequest }) {
  const [relationship, setRelationship] = useState<VouchRelationship>("worked_together");
  const [note, setNote] = useState("");
  const [accepting, setAccepting] = useState(false);
  const m = useMutation();
  const base = `/api/v1/vouches/requests/${request.id}/respond`;
  return (
    <article className="panel space-y-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <MemberLink member={request.requester} size={36} subtitle={request.forApplication ? "named you as a referee on their application" : "asked you to vouch for them"} />
        <span className="text-xs text-muted">{formatRelative(request.createdAt)}</span>
      </header>
      {request.message ? <blockquote className="border-l-2 border-border-strong pl-4 text-sm whitespace-pre-line">{request.message}</blockquote> : null}
      {accepting ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void m.run(base, { method: "POST", body: { accept: true, relationship, note: note || undefined } }, `You now vouch for ${request.requester.displayName}`);
          }}
        >
          <RelationshipFields idPrefix={`req-${request.id}`} relationship={relationship} setRelationship={setRelationship} note={note} setNote={setNote} />
          {m.error ? <Alert tone="error">{m.error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAccepting(false)}>
              Back
            </Button>
            <Button type="submit" size="sm" disabled={m.busy}>
              {m.busy ? "Saving…" : "Vouch"}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {m.error ? <Alert tone="error">{m.error}</Alert> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-xs text-muted">If you decline, they aren&apos;t told.</p>
            <Button variant="ghost" size="sm" disabled={m.busy} onClick={() => m.run(base, { method: "POST", body: { accept: false } }, "Request declined")}>
              Decline
            </Button>
            <Button size="sm" onClick={() => setAccepting(true)}>
              Vouch for them
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

export function ReceivedVouchRow({ vouch }: { vouch: ReceivedVouch }) {
  const m = useMutation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <MemberLink member={vouch.voucher} size={36} subtitle={RELATIONSHIP_LABELS[vouch.relationship]} />
        {vouch.note ? <p className="text-sm text-muted">“{vouch.note}”</p> : null}
      </div>
      <div className="flex items-center gap-2">
        {vouch.hidden ? <Badge>Hidden</Badge> : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={m.busy}
          onClick={() => m.run(`/api/v1/vouches/${vouch.id}`, { method: "PATCH", body: { hidden: !vouch.hidden } }, vouch.hidden ? "Shown on your profile" : "Hidden from your profile")}
        >
          {vouch.hidden ? "Show on profile" : "Hide"}
        </Button>
      </div>
      {m.error ? <Alert tone="error" className="w-full">{m.error}</Alert> : null}
    </li>
  );
}

export function GivenVouchRow({ vouch }: { vouch: GivenVouch }) {
  const m = useMutation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <MemberLink member={vouch.vouchee} size={36} subtitle={`${RELATIONSHIP_LABELS[vouch.relationship]} · ${formatRelative(vouch.createdAt)}`} />
      <Button variant="ghost" size="sm" disabled={m.busy} onClick={() => m.run(`/api/v1/vouches/${vouch.id}`, { method: "DELETE" }, "Vouch withdrawn")}>
        Withdraw
      </Button>
      {m.error ? <Alert tone="error" className="w-full">{m.error}</Alert> : null}
    </li>
  );
}

const SENT_STATUS: Record<SentVouchRequest["status"], { label: string; tone: "neutral" | "success" | "accent" }> = {
  pending: { label: "Waiting", tone: "accent" },
  accepted: { label: "Vouched", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "No answer", tone: "neutral" },
};

export function SentRequestRow({ request }: { request: SentVouchRequest }) {
  const m = useMutation();
  const s = SENT_STATUS[request.status];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <MemberLink member={request.voucher} size={36} subtitle={`${request.applicationId ? "Referee on your application · " : ""}${formatRelative(request.createdAt)}`} />
      <div className="flex items-center gap-2">
        <Badge tone={s.tone}>{s.label}</Badge>
        {request.status === "pending" ? (
          <Button variant="ghost" size="sm" disabled={m.busy} onClick={() => m.run(`/api/v1/vouches/requests/${request.id}/cancel`, { method: "POST" }, "Request cancelled")}>
            Cancel
          </Button>
        ) : null}
      </div>
      {m.error ? <Alert tone="error" className="w-full">{m.error}</Alert> : null}
    </li>
  );
}

/** On an open membership application: name existing members as referees. */
export function RefereeForm({ applicationId, referees }: { applicationId: string; referees: SentVouchRequest[] }) {
  const [handle, setHandle] = useState("");
  const m = useMutation();
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <p className="text-sm font-medium">Referees</p>
        <p className="text-xs text-muted">
          Name up to 5 ELVORA members who know you. We&apos;ll ask them to vouch for you, and our team sees their answers. Referees are optional.
        </p>
      </div>
      {referees.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {referees.map((r) => (
            <SentRequestRow key={r.id} request={r} />
          ))}
        </ul>
      ) : null}
      {referees.length < 5 ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await m.run(`/api/v1/applications/${applicationId}/referees`, { method: "POST", body: { handle } }, "Referee asked")) setHandle("");
          }}
        >
          <label htmlFor={`ref-${applicationId}`} className="sr-only">
            Referee&apos;s handle
          </label>
          <Input id={`ref-${applicationId}`} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" maxLength={31} className="sm:max-w-xs" />
          <Button type="submit" size="sm" variant="outline" disabled={m.busy || handle.trim().length < 3}>
            {m.busy ? "Asking…" : "Ask to vouch"}
          </Button>
        </form>
      ) : null}
      {m.error ? <Alert tone="error">{m.error}</Alert> : null}
      <p className="text-xs text-muted">
        Track every request on your{" "}
        <Link href="/vouches?tab=sent" className="text-accent hover:underline">
          vouches page
        </Link>
        .
      </p>
    </div>
  );
}
