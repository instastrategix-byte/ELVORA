import { ArrowLeft, Download, Eye, FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  DiscussionForm,
  DocumentUploader,
  InviteDialog,
  LeaveRoomButton,
  MemberControls,
  RemoveDocumentButton,
  RoomSettingsButton,
} from "@/components/deal-rooms/deal-room-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Alert, Avatar, Badge, Card, EmptyState } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEAL_ROOM_FILE_TYPES, DEAL_ROOM_ROLE_LABELS } from "@backend/modules/deal-rooms/constants";
import { getDealRoom } from "@backend/modules/deal-rooms/service";
import { requirePageSession } from "@backend/auth/viewer";
import { LocalTime } from "@/components/ui/local-time";

export const metadata: Metadata = { title: "Deal room", robots: { index: false } };

const TABS = ["documents", "discussion", "members", "activity"] as const;
type Tab = (typeof TABS)[number];

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DealRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { viewer, db } = await requirePageSession({ next: `/deal-rooms/${id}` });
  const sp = await searchParams;
  const result = await attempt(() => getDealRoom(db, viewer, id));
  if (!result.ok) return <ServiceNotice error={result.error} what="this deal room" />;
  // Not a member, removed, or still needs to accept the NDA (shown on the list page).
  if (!result.data) notFound();
  const room = result.data;
  const tabs: Tab[] = room.canManage ? [...TABS] : TABS.filter((t) => t !== "activity");
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : "documents";
  const isOwner = room.role === "owner";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/deal-rooms" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Deal rooms
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={room.status === "open" ? "success" : room.status === "closed" ? "warning" : "neutral"}>
              {room.status === "open" ? "Open" : room.status === "closed" ? "Closed · read-only" : "Archived · read-only"}
            </Badge>
            {room.ndaRequired ? (
              <Badge tone="accent">
                <Lock className="size-3" aria-hidden="true" /> NDA v{room.ndaVersion}
              </Badge>
            ) : null}
            <Badge>{DEAL_ROOM_ROLE_LABELS[room.role]}</Badge>
          </div>
          <h1 className="display text-4xl">{room.name}</h1>
          {room.description ? <p className="max-w-2xl whitespace-pre-wrap text-muted">{room.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {room.canManage && room.status === "open" ? <InviteDialog roomId={room.id} isOwner={isOwner} /> : null}
          {room.canManage ? (
            <RoomSettingsButton
              roomId={room.id}
              isOwner={isOwner}
              status={room.status}
              initial={{ name: room.name, description: room.description, ndaRequired: room.ndaRequired, ndaText: room.ndaText }}
            />
          ) : null}
          {!isOwner ? <LeaveRoomButton roomId={room.id} /> : null}
        </div>
      </header>

      <nav aria-label="Deal room sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t}
            href={t === "documents" ? `/deal-rooms/${room.id}` : `/deal-rooms/${room.id}?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm text-muted capitalize hover:text-fg",
              "aria-[current=page]:border-accent aria-[current=page]:text-fg",
            )}
          >
            {t === "activity" ? "Access log" : t}
            {t === "documents" ? ` (${room.documents.length})` : t === "members" ? ` (${room.members.filter((m) => m.joinedAt).length})` : ""}
          </Link>
        ))}
      </nav>

      {tab === "documents" ? (
        <section aria-label="Documents" className="space-y-4">
          {room.canWrite ? <DocumentUploader roomId={room.id} /> : null}
          {room.documents.length === 0 ? (
            <EmptyState icon={<FileText />} title="No documents yet" description={room.canWrite ? "Upload the first file to share it with the room." : "Documents shared here will appear in this list."} />
          ) : (
            <Card className="divide-y divide-border">
              {room.documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-xs font-semibold text-accent">
                    {DEAL_ROOM_FILE_TYPES[d.mimeType]?.ext.toUpperCase() ?? "FILE"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {d.fileName} <span className="text-xs text-muted">v{d.version}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {fileSize(d.sizeBytes)} · {d.uploadedBy?.displayName ?? "Former member"} · {formatRelative(d.createdAt)}
                    </p>
                    {d.previous.length ? (
                      <details className="mt-1 text-xs text-muted">
                        <summary className="cursor-pointer hover:text-fg">{d.previous.length} earlier version{d.previous.length > 1 ? "s" : ""}</summary>
                        <ul className="mt-1 space-y-1">
                          {d.previous.map((p) => (
                            <li key={p.id}>
                              <a className="hover:text-fg hover:underline" href={`/api/v1/deal-room-documents/${p.id}?download=1`}>
                                v{p.version} · {fileSize(p.sizeBytes)} · {formatRelative(p.createdAt)}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={`/api/v1/deal-room-documents/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-surface-2"
                    >
                      <Eye className="size-4" aria-hidden="true" /> Open
                    </a>
                    <a href={`/api/v1/deal-room-documents/${d.id}?download=1`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm hover:bg-surface-2">
                      <Download className="size-4" aria-hidden="true" /> Download
                    </a>
                    {d.canRemove ? <RemoveDocumentButton documentId={d.id} name={d.fileName} /> : null}
                  </div>
                </div>
              ))}
            </Card>
          )}
          <p className="text-xs text-muted">Every open and download is recorded in the room&apos;s access log, which the owner and admins can see.</p>
        </section>
      ) : null}

      {tab === "discussion" ? (
        <section aria-label="Discussion" className="space-y-4">
          {room.messages.length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : null}
          <ol className="space-y-3">
            {room.messages.map((m) => (
              <li key={m.id} className="flex gap-3">
                <Avatar src={m.author.avatarUrl} name={m.author.displayName} size={36} />
                <div className={cn("min-w-0 flex-1 rounded-2xl border border-border p-3", m.mine ? "bg-surface-2" : "bg-surface")}>
                  <p className="text-xs text-muted">
                    <span className="font-medium text-fg">{m.author.displayName}</span> · {formatRelative(m.createdAt)}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{m.body}</p>
                </div>
              </li>
            ))}
          </ol>
          {room.canWrite ? (
            <DiscussionForm roomId={room.id} />
          ) : (
            <Alert tone="info">{room.status !== "open" ? "This room is read-only." : "Viewers can read the discussion but not post."}</Alert>
          )}
        </section>
      ) : null}

      {tab === "members" ? (
        <section aria-label="Members">
          <Card className="divide-y divide-border">
            {room.members.map((m) => (
              <div key={m.user.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar src={m.user.avatarUrl} name={m.user.displayName} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/members/${m.user.handle}`} className="font-medium hover:text-accent">
                    {m.user.displayName}
                  </Link>
                  <p className="text-xs text-muted">
                    {DEAL_ROOM_ROLE_LABELS[m.role]}
                    {!m.joinedAt ? " · invitation pending" : room.ndaRequired && !m.ndaCurrent ? " · must accept the new NDA" : ""}
                    {room.ndaRequired && m.ndaAcceptedAt && m.ndaCurrent ? <> · NDA accepted <LocalTime iso={m.ndaAcceptedAt} /></> : null}
                  </p>
                </div>
                {m.role !== "owner" && m.user.id !== viewer.id && room.canManage ? (
                  <MemberControls
                    roomId={room.id}
                    userId={m.user.id}
                    role={m.role}
                    canChangeRole={isOwner && room.status === "open"}
                    canRemove={isOwner || m.role === "member" || m.role === "viewer"}
                  />
                ) : null}
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {tab === "activity" && room.accessLog ? (
        <section aria-label="Access log" className="space-y-3">
          <p className="text-sm text-muted">Who opened or downloaded each document. This history can&apos;t be edited or deleted.</p>
          {room.accessLog.length === 0 ? (
            <p className="text-sm text-muted">No documents have been opened yet.</p>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Document access log</caption>
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-border">
                    <th scope="col" className="p-3 font-medium">When</th>
                    <th scope="col" className="p-3 font-medium">Member</th>
                    <th scope="col" className="p-3 font-medium">Document</th>
                    <th scope="col" className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {room.accessLog.map((l) => (
                    <tr key={l.id}>
                      <td className="p-3 whitespace-nowrap"><LocalTime iso={l.createdAt} /></td>
                      <td className="p-3">{l.user?.displayName ?? "Deleted account"}</td>
                      <td className="p-3">{l.documentName}</td>
                      <td className="p-3">{l.action === "download" ? "Downloaded" : "Opened"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      ) : null}
    </div>
  );
}
