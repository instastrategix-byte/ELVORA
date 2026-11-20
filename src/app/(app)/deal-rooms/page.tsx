import { FileLock2, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateDealRoomButton, InvitationActions } from "@/components/deal-rooms/deal-room-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { DEAL_ROOM_ROLE_LABELS } from "@backend/modules/deal-rooms/constants";
import { listDealRooms } from "@backend/modules/deal-rooms/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Deal rooms", robots: { index: false } };

const STATUS_TONE = { open: "success", closed: "warning", archived: "neutral" } as const;

export default async function DealRoomsPage() {
  const { viewer, db } = await requirePageSession({ next: "/deal-rooms" });
  const result = await attempt(() => listDealRooms(db, viewer));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Workspace"
        title="Deal rooms"
        description="Private, invite-only spaces for a deal: documents with version history, a discussion, an optional NDA and a record of who opened what."
        actions={<CreateDealRoomButton />}
      />
      {!result.ok ? (
        <ServiceNotice error={result.error} what="your deal rooms" />
      ) : (
        <div className="space-y-10">
          {result.data.invitations.length ? (
            <section aria-labelledby="invitations-heading" className="space-y-4">
              <h2 id="invitations-heading" className="display text-2xl">
                Waiting for you
              </h2>
              {result.data.invitations.map((inv) => (
                <Card key={inv.roomId} className="space-y-4 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">{inv.rejoin ? "Updated terms" : "Invitation"}</p>
                      <h3 className="display mt-1 text-xl">{inv.name}</h3>
                      <p className="text-sm text-muted">
                        {inv.rejoin
                          ? "The NDA for this room changed. Accept the new terms to keep access."
                          : `${inv.invitedBy?.displayName ?? "A member"} invited you as ${DEAL_ROOM_ROLE_LABELS[inv.role].toLowerCase()} · ${formatRelative(inv.invitedAt)}`}
                      </p>
                    </div>
                    {inv.ndaRequired ? (
                      <Badge tone="accent">
                        <Lock className="size-3" aria-hidden="true" /> NDA required
                      </Badge>
                    ) : null}
                  </div>
                  {inv.ndaRequired && inv.ndaText ? (
                    <div className="max-h-64 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-4 text-sm whitespace-pre-wrap" tabIndex={0} aria-label="NDA terms">
                      {inv.ndaText}
                    </div>
                  ) : null}
                  <InvitationActions roomId={inv.roomId} ndaRequired={inv.ndaRequired} ndaVersion={inv.ndaVersion} rejoin={inv.rejoin} />
                </Card>
              ))}
            </section>
          ) : null}

          <section aria-labelledby="rooms-heading" className="space-y-4">
            <h2 id="rooms-heading" className="display text-2xl">
              Your rooms
            </h2>
            {result.data.rooms.length === 0 ? (
              <EmptyState
                icon={<FileLock2 />}
                title="No deal rooms yet"
                description="Create one for a fundraise, an acquisition or a property sale, then invite your connections."
              />
            ) : (
              <ul className="stagger grid gap-3 sm:grid-cols-2">
                {result.data.rooms.map((room) => (
                  <li key={room.id}>
                    <Link href={`/deal-rooms/${room.id}`} className="panel pressable block p-5 transition-colors hover:border-border-strong">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-lg font-semibold">{room.name}</h3>
                        <Badge tone={STATUS_TONE[room.status]}>{room.status === "open" ? "Open" : room.status === "closed" ? "Closed" : "Archived"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted">
                        {DEAL_ROOM_ROLE_LABELS[room.role]}
                        {room.ndaRequired ? " · NDA" : ""} · updated {formatRelative(room.updatedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
