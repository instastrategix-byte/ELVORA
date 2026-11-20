"use client";

import { BellPlus, Check, NotebookPen, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDate, localDateIso } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import { CONTACT_STAGE_LABELS, CONTACT_STAGES, type ContactStage } from "@backend/modules/contacts/constants";

export type EditorNote = { body: string; tags: string[]; stage: ContactStage; lastContactedOn: string | null } | null;
export type EditorReminder = { id: string; dueOn: string; body: string };

/** Today's calendar date where the member is (not UTC — that's the wrong day for part of every day). */
function todayIso(): string {
  return localDateIso(new Date());
}

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

/** Note, tags, stage, last-contacted date and reminders for one contact. Private to the viewer. */
export function ContactEditor({
  contactId,
  name,
  note,
  reminders,
  onSaved,
}: {
  contactId: string;
  name: string;
  note: EditorNote;
  reminders: EditorReminder[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(reminders);
  const save = useAction((body: unknown) => api(`/api/v1/contacts/${contactId}`, { method: "PUT", body }));
  const addReminder = useAction((body: unknown) => api<EditorReminder>(`/api/v1/contacts/${contactId}/reminders`, { method: "POST", body }));
  const updateReminder = useAction((id: string, body: unknown) => api(`/api/v1/contact-reminders/${id}`, { method: "PATCH", body }));
  const removeReminder = useAction((id: string) => api(`/api/v1/contact-reminders/${id}`, { method: "DELETE" }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const tags = parseTags(String(f.get("tags") ?? ""));
    if (tags.some((t) => t.length > 32)) return save.setErrors({ tags: ["Tags can be up to 32 characters"] });
    const body = {
      body: String(f.get("body") ?? ""),
      tags,
      stage: String(f.get("stage") ?? "none"),
      lastContactedOn: String(f.get("lastContactedOn") ?? "") || null,
    };
    if ((await save.run(body)) !== undefined) {
      toast.show("Private note saved");
      router.refresh();
      onSaved?.();
    }
  }

  async function onAddReminder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = { dueOn: String(f.get("dueOn") ?? ""), body: String(f.get("reminder") ?? "").trim() };
    if (!body.body) return addReminder.setErrors({ body: ["What should you follow up on?"] });
    if (!body.dueOn) return addReminder.setErrors({ dueOn: ["Choose a date"] });
    const created = await addReminder.run(body);
    if (created) {
      setItems((list) => [...list, created].sort((a, b) => a.dueOn.localeCompare(b.dueOn)));
      form.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {save.error ? <Alert tone="error">{save.error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`stage-${contactId}`} label="Stage" error={save.fieldErrors.stage}>
            {(a) => (
              <Select name="stage" defaultValue={note?.stage ?? "none"} {...a}>
                {CONTACT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {CONTACT_STAGE_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`last-${contactId}`} label="Last contacted" error={save.fieldErrors.lastContactedOn}>
            {(a) => <Input type="date" name="lastContactedOn" max={todayIso()} defaultValue={note?.lastContactedOn ?? ""} {...a} />}
          </Field>
        </div>
        <Field id={`tags-${contactId}`} label="Tags" hint="Separate with commas, e.g. investor, dubai, lp" error={save.fieldErrors.tags}>
          {(a) => <Input name="tags" defaultValue={note?.tags.join(", ") ?? ""} maxLength={400} {...a} />}
        </Field>
        <Field id={`note-${contactId}`} label="Notes" error={save.fieldErrors.body}>
          {(a) => <Textarea name="body" rows={6} maxLength={5000} defaultValue={note?.body ?? ""} placeholder={`How you met ${name}, what matters to them, what you discussed…`} {...a} />}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save note"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              const input = e.currentTarget.form?.elements.namedItem("lastContactedOn");
              if (input instanceof HTMLInputElement) input.value = todayIso();
            }}
          >
            Contacted today
          </Button>
        </div>
      </form>

      <section aria-label="Follow-up reminders" className="space-y-3 border-t border-border pt-5">
        <h3 className="font-medium">Follow-ups</h3>
        {updateReminder.error || removeReminder.error ? <Alert tone="error">{updateReminder.error ?? removeReminder.error}</Alert> : null}
        {items.length === 0 ? <p className="text-sm text-muted">No open follow-ups.</p> : null}
        <ul className="space-y-2">
          {items.map((r) => {
            const due = r.dueOn <= todayIso();
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p>{r.body}</p>
                  <p className="text-xs text-muted">{formatDate(r.dueOn)}</p>
                </div>
                {due ? <Badge tone="warning">Due</Badge> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Mark done"
                  disabled={updateReminder.pending}
                  onClick={async () => {
                    if ((await updateReminder.run(r.id, { done: true })) !== undefined) {
                      setItems((list) => list.filter((x) => x.id !== r.id));
                      router.refresh();
                    }
                  }}
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete follow-up"
                  disabled={removeReminder.pending}
                  onClick={async () => {
                    if ((await removeReminder.run(r.id)) !== undefined) {
                      setItems((list) => list.filter((x) => x.id !== r.id));
                      router.refresh();
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
        <form onSubmit={onAddReminder} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" noValidate>
          {addReminder.error ? (
            <Alert tone="error" className="sm:col-span-3">
              {addReminder.error}
            </Alert>
          ) : null}
          <Field id={`rem-${contactId}`} label="Follow up on" error={addReminder.fieldErrors.body}>
            {(a) => <Input name="reminder" maxLength={300} placeholder="Send the term sheet" {...a} />}
          </Field>
          <Field id={`rem-date-${contactId}`} label="When" error={addReminder.fieldErrors.dueOn}>
            {(a) => <Input type="date" name="dueOn" min={todayIso()} defaultValue={todayIso()} {...a} />}
          </Field>
          <Button type="submit" variant="secondary" disabled={addReminder.pending}>
            <BellPlus /> Add
          </Button>
        </form>
        <p className="text-xs text-muted">Follow-ups appear on your Home page and here when they&apos;re due. No emails are sent.</p>
      </section>
    </div>
  );
}

/** Opens the editor in a panel. Loads the latest note when opened. */
export function ContactEditorDialog({
  contactId,
  name,
  note,
  reminders,
  triggerLabel = "Notes",
}: {
  contactId: string;
  name: string;
  note: EditorNote;
  reminders: EditorReminder[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <NotebookPen /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent title={name} description="Private to you. They can never see these notes." size="lg">
        <ContactEditor contactId={contactId} name={name} note={note} reminders={reminders} />
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <X /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
