import { Lock } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate } from "@/lib/format";
import { CONTACT_STAGE_LABELS } from "@backend/modules/contacts/constants";
import { getContact } from "@backend/modules/contacts/service";
import { getSession } from "@backend/auth/viewer";
import { ContactEditorDialog } from "@/components/contacts/contact-editor";

/**
 * The viewer's private notes about the member whose profile they're viewing. Rendered only for
 * the viewer; RLS guarantees nobody else (including the member) can read the note. Hidden when the
 * viewer can't keep notes on this person (not connected, never messaged) and has none.
 */
export async function PrivateNotesCard({ contactId, name }: { contactId: string; name: string }) {
  const session = await getSession();
  if (!session || session.viewer.id === contactId) return null;
  const result = await attempt(() => getContact(session.db, contactId));
  if (!result.ok) return null;
  const { note, reminders, allowed } = result.data;
  if (!allowed && !note) return null;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4 text-accent" aria-hidden="true" /> Private notes
        </h2>
        {allowed ? (
          <ContactEditorDialog
            contactId={contactId}
            name={name}
            note={note ? { body: note.body, tags: note.tags, stage: note.stage, lastContactedOn: note.lastContactedOn } : null}
            reminders={reminders.map((r) => ({ id: r.id, dueOn: r.dueOn, body: r.body }))}
            triggerLabel={note ? "Edit" : "Add note"}
          />
        ) : null}
      </div>
      {note ? (
        <div className="space-y-2 text-sm">
          {note.stage !== "none" ? <Badge tone="accent">{CONTACT_STAGE_LABELS[note.stage]}</Badge> : null}
          {note.body ? <p className="line-clamp-4 whitespace-pre-line text-muted">{note.body}</p> : null}
          {note.tags.length ? <p className="text-xs text-muted">{note.tags.map((t) => `#${t}`).join(" ")}</p> : null}
          {note.lastContactedOn ? <p className="text-xs text-muted">Last contacted {formatDate(note.lastContactedOn)}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Keep notes, tags and follow-ups about {name}. Only you can see them.</p>
      )}
      {reminders[0] ? (
        <p className="text-xs text-muted">
          Next follow-up: {reminders[0].body} · {formatDate(reminders[0].dueOn)}
        </p>
      ) : null}
    </Card>
  );
}
