"use client";

import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Card, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { experienceSchema } from "@backend/modules/profiles/schemas";
import type { Experience } from "@backend/modules/profiles/types";
import { experienceRange } from "./experience-format";

function sortExperiences(items: Experience[]): Experience[] {
  return [...items].sort((a, b) => {
    if (!a.endsOn !== !b.endsOn) return a.endsOn ? 1 : -1;
    return b.startsOn.localeCompare(a.startsOn);
  });
}

/** Month inputs submit "YYYY-MM"; the API stores dates, so pin to the first of the month. */
const monthToDate = (v: string) => (v ? `${v}-01` : "");
const dateToMonth = (v: string | null | undefined) => (v ? v.slice(0, 7) : "");

export function ExperienceEditor({ initial }: { initial: Experience[] }) {
  const [items, setItems] = useState(() => sortExperiences(initial));
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <Card id="experience" className="scroll-mt-28 space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-2xl">Experience</h2>
          <p className="mt-1 text-sm text-muted">Your roles, newest first. Visible to whoever can see your profile.</p>
        </div>
        {editing === null && items.length < 20 ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" /> Add role
          </Button>
        ) : null}
      </div>

      {editing === "new" ? (
        <ExperienceForm
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((prev) => sortExperiences([...prev, saved]));
            setEditing(null);
          }}
        />
      ) : null}

      {items.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={<Briefcase className="size-6" aria-hidden="true" />}
          title="No experience yet"
          description="Add the roles you want members to know about."
        />
      ) : (
        <ol className="divide-y divide-border">
          {items.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="py-4">
                <ExperienceForm
                  existing={item}
                  onCancel={() => setEditing(null)}
                  onSaved={(saved) => {
                    setItems((prev) => sortExperiences(prev.map((p) => (p.id === saved.id ? saved : p))));
                    setEditing(null);
                  }}
                  onDeleted={() => {
                    setItems((prev) => prev.filter((p) => p.id !== item.id));
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={item.id} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted">
                    {item.company}
                    {item.location ? ` · ${item.location}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{experienceRange(item)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(item.id)}
                  disabled={editing !== null}
                  aria-label={`Edit ${item.title} at ${item.company}`}
                >
                  <Pencil className="size-4" aria-hidden="true" /> Edit
                </Button>
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  );
}

function ExperienceForm({
  existing,
  onCancel,
  onSaved,
  onDeleted,
}: {
  existing?: Experience;
  onCancel: () => void;
  onSaved: (e: Experience) => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const save = useAction((body: unknown) =>
    existing
      ? api<Experience>(`/api/v1/profile/experiences/${existing.id}`, { method: "PATCH", body })
      : api<Experience>("/api/v1/profile/experiences", { method: "POST", body }),
  );
  const remove = useAction(() => api(`/api/v1/profile/experiences/${existing!.id}`, { method: "DELETE" }));
  const [current, setCurrent] = useState(existing ? existing.endsOn === null : true);
  const prefix = existing ? `exp-${existing.id}` : "exp-new";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    const input = {
      title: text("title"),
      company: text("company"),
      location: text("location"),
      startsOn: monthToDate(text("startsOn")),
      endsOn: current ? "" : monthToDate(text("endsOn")),
      description: text("description"),
    };
    const parsed = experienceSchema.safeParse(input);
    if (!parsed.success) return save.setErrors(zodFieldErrors(parsed.error.issues), "Please fix the highlighted fields.");
    const saved = await save.run(input);
    if (saved) {
      toast.show(existing ? "Role updated" : "Role added");
      onSaved(saved);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Remove ${existing!.title} at ${existing!.company} from your profile?`)) return;
    const done = await remove.run();
    if (done !== undefined) {
      toast.show("Role removed");
      onDeleted?.();
    }
  }

  const fe = save.fieldErrors;
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 rounded-xl border border-border bg-surface-2 p-4 sm:grid-cols-2">
      {save.error || remove.error ? (
        <Alert tone="error" className="sm:col-span-2">
          {save.error ?? remove.error}
        </Alert>
      ) : null}
      <Field id={`${prefix}-title`} label="Title" required error={fe.title}>
        {(a) => <Input name="title" defaultValue={existing?.title} maxLength={80} {...a} />}
      </Field>
      <Field id={`${prefix}-company`} label="Company" required error={fe.company}>
        {(a) => <Input name="company" defaultValue={existing?.company} maxLength={80} {...a} />}
      </Field>
      <Field id={`${prefix}-location`} label="Location" error={fe.location} className="sm:col-span-2">
        {(a) => <Input name="location" defaultValue={existing?.location ?? ""} maxLength={120} {...a} />}
      </Field>
      <Field id={`${prefix}-start`} label="Start" required error={fe.startsOn}>
        {(a) => <Input name="startsOn" type="month" defaultValue={dateToMonth(existing?.startsOn)} {...a} />}
      </Field>
      <Field id={`${prefix}-end`} label="End" error={fe.endsOn}>
        {(a) => <Input name="endsOn" type="month" defaultValue={dateToMonth(existing?.endsOn)} disabled={current} {...a} />}
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        I currently hold this role
      </label>
      <Field id={`${prefix}-description`} label="Description" error={fe.description} className="sm:col-span-2">
        {(a) => <Textarea name="description" defaultValue={existing?.description ?? ""} maxLength={600} rows={3} {...a} />}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        {existing ? (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={remove.pending || save.pending} className="text-danger">
            <Trash2 className="size-4" aria-hidden="true" /> {remove.pending ? "Removing…" : "Remove"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.pending}>
            {save.pending ? "Saving…" : existing ? "Save role" : "Add role"}
          </Button>
        </div>
      </div>
    </form>
  );
}
