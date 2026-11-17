"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { EVENT_FORMATS, FORMAT_LABELS, eventSchema } from "@backend/modules/events/schemas";
import type { EventDetail } from "@backend/modules/events/types";

/** ISO -> value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function EventForm({ event, business }: { event?: EventDetail; business?: { id: string; name: string } | null }) {
  const [format, setFormat] = useState<(typeof EVENT_FORMATS)[number]>(event?.format ?? "in_person");
  const [coverPath, setCoverPath] = useState<string | null>(event?.coverPath ?? null);
  const action = useAction((body: unknown) =>
    event ? api<{ id: string }>(`/api/v1/events/${event.id}`, { method: "PATCH", body }) : api<{ id: string }>("/api/v1/events", { method: "POST", body }),
  );
  const router = useRouter();
  const toast = useToast();
  const locked = event?.status === "cancelled";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const capacity = String(f.get("capacity") ?? "").trim();
    const input = {
      title: String(f.get("title") ?? ""),
      summary: String(f.get("summary") ?? ""),
      description: String(f.get("description") ?? ""),
      format,
      venueName: String(f.get("venueName") ?? ""),
      city: String(f.get("city") ?? ""),
      country: String(f.get("country") ?? ""),
      onlineUrl: String(f.get("onlineUrl") ?? ""),
      startsAt: toIso(String(f.get("startsAt") ?? "")),
      endsAt: toIso(String(f.get("endsAt") ?? "")),
      capacity: capacity ? Number(capacity) : null,
      visibility: String(f.get("visibility") ?? "members"),
      coverPath,
      businessId: f.get("asBusiness") === "on" && business ? business.id : null,
    };
    const parsed = eventSchema.safeParse(input);
    if (!parsed.success) return action.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const result = await action.run(parsed.data);
    if (result === undefined) return;
    toast.show(event ? "Event saved" : "Draft created — publish it when you're ready");
    router.push(`/events/${result.id}`);
    router.refresh();
  }

  const fe = action.fieldErrors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      {locked ? <Alert tone="info">This event was cancelled and can no longer be edited.</Alert> : null}
      <fieldset disabled={locked || action.pending} className="space-y-6">
        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <Field id="e-title" label="Title" required error={fe.title} className="sm:col-span-2">
            {(a) => <Input name="title" defaultValue={event?.title} maxLength={120} {...a} />}
          </Field>
          <Field id="e-summary" label="Summary" error={fe.summary} hint="One line shown in listings." className="sm:col-span-2">
            {(a) => <Input name="summary" defaultValue={event?.summary ?? ""} maxLength={280} {...a} />}
          </Field>
          <Field id="e-desc" label="Details" error={fe.description} hint="Agenda, dress code, who it's for." className="sm:col-span-2">
            {(a) => <Textarea name="description" defaultValue={event?.description ?? ""} maxLength={4000} rows={7} {...a} />}
          </Field>
          <Field id="e-start" label="Starts" required error={fe.startsAt}>
            {(a) => <Input type="datetime-local" name="startsAt" defaultValue={toLocalInput(event?.startsAt)} suppressHydrationWarning {...a} />}
          </Field>
          <Field id="e-end" label="Ends" required error={fe.endsAt}>
            {(a) => <Input type="datetime-local" name="endsAt" defaultValue={toLocalInput(event?.endsAt)} suppressHydrationWarning {...a} />}
          </Field>
        </Card>

        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <h2 className="display text-2xl sm:col-span-2">Where</h2>
          <Field id="e-format" label="Format" required className="sm:col-span-2">
            {(a) => (
              <Select name="format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} {...a}>
                {EVENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {format !== "virtual" ? (
            <>
              <Field id="e-venue" label="Venue" error={fe.venueName} className="sm:col-span-2">
                {(a) => <Input name="venueName" defaultValue={event?.venueName ?? ""} maxLength={120} {...a} />}
              </Field>
              <Field id="e-city" label="City" required error={fe.city}>
                {(a) => <Input name="city" defaultValue={event?.city ?? ""} maxLength={80} {...a} />}
              </Field>
              <Field id="e-country" label="Country" error={fe.country}>
                {(a) => <Input name="country" defaultValue={event?.country ?? ""} maxLength={80} {...a} />}
              </Field>
            </>
          ) : null}
          {format !== "in_person" ? (
            <Field
              id="e-url"
              label="Joining link"
              required
              error={fe.onlineUrl}
              hint="Shown only to you and confirmed attendees."
              className="sm:col-span-2"
            >
              {(a) => <Input name="onlineUrl" type="url" inputMode="url" placeholder="https://" defaultValue={event?.onlineUrl ?? ""} {...a} />}
            </Field>
          ) : null}
        </Card>

        <Card className="grid gap-5 p-6 sm:grid-cols-2">
          <h2 className="display text-2xl sm:col-span-2">Guests</h2>
          <Field id="e-vis" label="Who can see it" hint="Invite-only events are visible only to members you invite.">
            {(a) => (
              <Select name="visibility" defaultValue={event?.visibility ?? "members"} {...a}>
                <option value="members">All members</option>
                <option value="invite_only">Invite only</option>
              </Select>
            )}
          </Field>
          <Field id="e-cap" label="Capacity" error={fe.capacity} hint="Leave empty for no limit. Extra guests join a waitlist.">
            {(a) => <Input name="capacity" type="number" min={1} max={5000} defaultValue={event?.capacity ?? ""} {...a} />}
          </Field>
          {business ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="asBusiness" defaultChecked={Boolean(event?.businessId)} className="size-4 accent-[var(--accent)]" />
              Host on behalf of {business.name}
            </label>
          ) : null}
          <div className="sm:col-span-2">
            <ImageUpload purpose="cover" label="Cover image" currentUrl={event?.coverUrl ?? null} onChange={setCoverPath} />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? "Saving…" : event ? "Save changes" : "Create draft"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
