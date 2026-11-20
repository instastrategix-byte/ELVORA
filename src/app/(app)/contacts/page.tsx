import { BellRing, Contact } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactEditorDialog } from "@/components/contacts/contact-editor";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate } from "@/lib/format";
import { CONTACT_STAGE_LABELS, CONTACT_STAGES } from "@backend/modules/contacts/constants";
import { filterContacts, listContacts } from "@backend/modules/contacts/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Contacts", robots: { index: false } };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/contacts" });
  const sp = await searchParams;
  const filters = {
    q: one(sp.q)?.slice(0, 100),
    stage: CONTACT_STAGES.includes(one(sp.stage) as never) ? one(sp.stage) : undefined,
    tag: one(sp.tag)?.slice(0, 32),
    due: one(sp.due) === "1",
  };
  const result = await attempt(() => listContacts(db, viewer));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Network"
        title="Contacts"
        description="Your private relationship notes: how you met, where things stand and when to follow up. Only you can see them."
      />
      {!result.ok ? (
        <ServiceNotice error={result.error} what="your contacts" />
      ) : (
        (() => {
          const all = result.data;
          const rows = filterContacts(all, filters);
          const dueCount = all.filter((r) => r.dueOn).length;
          const tags = [...new Set(all.flatMap((r) => r.note?.tags ?? []))].sort();
          return (
            <div className="space-y-6">
              <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search" aria-label="Filter contacts">
                <Input name="q" defaultValue={filters.q ?? ""} placeholder="Search names, notes or tags" aria-label="Search contacts" />
                <Select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage">
                  <option value="">All stages</option>
                  {CONTACT_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {CONTACT_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
                <Select name="tag" defaultValue={filters.tag ?? ""} aria-label="Tag">
                  <option value="">All tags</option>
                  {tags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Filter
                </Button>
              </form>

              {dueCount ? (
                <Link
                  href={filters.due ? "/contacts" : "/contacts?due=1"}
                  className="flex items-center gap-2 rounded-xl border border-warning/40 p-3 text-sm text-warning hover:bg-surface-2"
                >
                  <BellRing className="size-4" aria-hidden="true" />
                  {dueCount} follow-up{dueCount > 1 ? "s" : ""} due {filters.due ? "· show everyone" : "· show only these"}
                </Link>
              ) : null}

              {all.length === 0 ? (
                <EmptyState icon={<Contact />} title="No contacts yet" description="Your connections appear here. Connect with members to start keeping notes." />
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted">No contacts match these filters.</p>
              ) : (
                <Card className="divide-y divide-border">
                  {rows.map((r) => (
                    <div key={r.person.id} className="flex flex-wrap items-center gap-3 p-4">
                      <Avatar src={r.person.avatarUrl} name={r.person.displayName} size={44} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/members/${r.person.handle}`} className="font-medium hover:text-accent">
                            {r.person.displayName}
                          </Link>
                          {r.note && r.note.stage !== "none" ? <Badge tone="accent">{CONTACT_STAGE_LABELS[r.note.stage]}</Badge> : null}
                          {r.dueOn ? <Badge tone="warning">Follow-up due</Badge> : null}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {r.person.headline ?? `@${r.person.handle}`}
                          {r.note?.lastContactedOn ? ` · last contacted ${formatDate(r.note.lastContactedOn)}` : ""}
                        </p>
                        {r.note?.tags.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.note.tags.map((t) => (
                              <Link key={t} href={`/contacts?tag=${encodeURIComponent(t)}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted hover:text-fg">
                                #{t}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                        {r.reminders[0] ? <p className="text-xs text-muted">Next: {r.reminders[0].body} · {formatDate(r.reminders[0].dueOn)}</p> : null}
                      </div>
                      <ContactEditorDialog
                        contactId={r.person.id}
                        name={r.person.displayName}
                        note={r.note}
                        reminders={r.reminders.map((x) => ({ id: x.id, dueOn: x.dueOn, body: x.body }))}
                      />
                    </div>
                  ))}
                </Card>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
