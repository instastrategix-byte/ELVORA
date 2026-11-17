"use client";

import { Check, Star, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import type { EventStatus, RsvpStatus } from "@backend/modules/events/types";

const RESULT_MESSAGE: Partial<Record<RsvpStatus, string>> = {
  going: "You're on the guest list",
  waitlisted: "The event is full — you're on the waitlist",
  interested: "Marked as interested",
  cancelled: "Response updated",
};

/** Going / Interested / Not going. The server decides the final status (e.g. waitlisted when full). */
export function RsvpControl({ eventId, current }: { eventId: string; current: RsvpStatus | null }) {
  const [status, setStatus] = useState<RsvpStatus | null>(current);
  const action = useAction((next: "going" | "interested" | "cancelled") =>
    api<{ status: RsvpStatus }>(`/api/v1/events/${eventId}/rsvp`, { method: "POST", body: { status: next } }),
  );
  const toast = useToast();
  const router = useRouter();

  async function respond(next: "going" | "interested" | "cancelled") {
    const result = await action.run(next);
    if (!result) return;
    setStatus(result.status);
    toast.show(RESULT_MESSAGE[result.status] ?? "Response saved");
    router.refresh();
  }

  const attending = status === "going" || status === "waitlisted";
  return (
    <div className="space-y-3">
      {status === "invited" ? <p className="text-sm text-muted">You&apos;ve been invited. Will you attend?</p> : null}
      {status === "waitlisted" ? (
        <Alert tone="info">You&apos;re on the waitlist. We&apos;ll notify you if a place opens up.</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your response">
        <Button onClick={() => respond("going")} disabled={action.pending || attending} aria-pressed={attending}>
          <Check aria-hidden="true" /> {status === "going" ? "Going" : status === "waitlisted" ? "Waitlisted" : "Attend"}
        </Button>
        <Button
          variant="outline"
          onClick={() => respond("interested")}
          disabled={action.pending || status === "interested"}
          aria-pressed={status === "interested"}
        >
          <Star aria-hidden="true" /> Interested
        </Button>
        {status && status !== "cancelled" ? (
          <Button variant="ghost" onClick={() => respond("cancelled")} disabled={action.pending}>
            <X aria-hidden="true" /> Can&apos;t make it
          </Button>
        ) : null}
      </div>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
    </div>
  );
}

type HostAction = "publish" | "unpublish" | "cancel";

/** Publish / unpublish / cancel / delete, each confirmed where it affects guests. */
export function HostControls({ eventId, status, ended }: { eventId: string; status: EventStatus; ended: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const statusAction = useAction((a: HostAction) => api(`/api/v1/events/${eventId}/status`, { method: "POST", body: { action: a } }));
  const deleteAction = useAction(() => api(`/api/v1/events/${eventId}`, { method: "DELETE" }));

  async function apply(a: HostAction) {
    const ok = await statusAction.run(a);
    if (ok === undefined) return;
    toast.show(a === "publish" ? "Event published" : a === "cancel" ? "Event cancelled — guests have been notified" : "Moved back to draft");
    router.refresh();
  }

  async function remove() {
    const ok = await deleteAction.run();
    if (ok === undefined) return;
    toast.show("Draft deleted");
    router.push("/events?filter=hosting");
  }

  if (status === "cancelled") return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!ended ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/events/${eventId}/edit`}>Edit</Link>
          </Button>
        ) : null}
        {status === "draft" && !ended ? (
          <Button size="sm" onClick={() => apply("publish")} disabled={statusAction.pending}>
            Publish
          </Button>
        ) : null}
        {status === "published" ? (
          <Button size="sm" variant="ghost" onClick={() => apply("unpublish")} disabled={statusAction.pending}>
            Unpublish
          </Button>
        ) : null}
        {status === "published" && !ended ? (
          <Confirm
            trigger="Cancel event"
            title="Cancel this event?"
            body="Everyone who responded will be notified. A cancelled event can't be reopened."
            confirm="Cancel event"
            onConfirm={() => apply("cancel")}
            pending={statusAction.pending}
          />
        ) : null}
        {status === "draft" ? (
          <Confirm
            trigger="Delete draft"
            title="Delete this draft?"
            body="This can't be undone."
            confirm="Delete"
            onConfirm={remove}
            pending={deleteAction.pending}
          />
        ) : null}
      </div>
      {statusAction.error || deleteAction.error ? <Alert tone="error">{statusAction.error ?? deleteAction.error}</Alert> : null}
    </div>
  );
}

function Confirm({
  trigger,
  title,
  body,
  confirm,
  onConfirm,
  pending,
}: {
  trigger: string;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-danger">
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={body}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Keep it</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="danger" onClick={onConfirm} disabled={pending}>
              {confirm}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Host invites a member by handle; the invitation makes invite-only events visible to them. */
export function InviteForm({ eventId }: { eventId: string }) {
  const action = useAction((handle: string) => api(`/api/v1/events/${eventId}/invitations`, { method: "POST", body: { handle } }));
  const toast = useToast();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const handle = String(new FormData(form).get("handle") ?? "").trim();
    if (!handle) return;
    const ok = await action.run(handle);
    if (ok === undefined) return;
    toast.show(`Invitation sent to @${handle.replace(/^@/, "")}`);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2" noValidate>
      <Field id="invite-handle" label="Invite a member" error={action.fieldErrors.handle ?? (action.error ? action.error : undefined)} className="flex-1">
        {(a) => <Input name="handle" placeholder="@handle" autoComplete="off" {...a} />}
      </Field>
      <Button type="submit" variant="outline" disabled={action.pending}>
        Invite
      </Button>
    </form>
  );
}
