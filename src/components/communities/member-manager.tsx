"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import type { CommunityMemberView } from "@backend/modules/communities/types";

type Action = "approve" | "decline" | "ban" | "unban" | "remove" | "promote" | "demote";

const CONFIRM: Partial<Record<Action, string>> = {
  ban: "Ban this member? They will lose access and can't rejoin until unbanned.",
  remove: "Remove this member from the community?",
  decline: "Decline this request?",
};

const DONE: Record<Action, string> = {
  approve: "Request approved",
  decline: "Request declined",
  ban: "Member banned",
  unban: "Member unbanned",
  remove: "Member removed",
  promote: "Promoted to moderator",
  demote: "Moderator role removed",
};

/** Pending requests, roster and bans with the actions the viewer's role allows. */
export function MemberManager({
  communityId,
  pending,
  members,
  banned,
  isOwner,
  viewerId,
}: {
  communityId: string;
  pending: CommunityMemberView[];
  members: CommunityMemberView[];
  banned: CommunityMemberView[];
  isOwner: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(userId: string, action: Action) {
    const confirmText = CONFIRM[action];
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(`${userId}:${action}`);
    try {
      await api(`/api/v1/communities/${communityId}/members`, { method: "POST", body: { userId, action } });
      toast.show(DONE[action]);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  const btn = (userId: string, action: Action, label: string, variant: "primary" | "outline" | "ghost" | "danger" = "outline") => (
    <Button key={action} size="sm" variant={variant} disabled={busy !== null} onClick={() => act(userId, action)}>
      {busy === `${userId}:${action}` ? "…" : label}
    </Button>
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="pending-h">
        <h2 id="pending-h" className="mb-3 text-sm font-semibold tracking-wide">
          Requests to join {pending.length ? <span className="text-muted">({pending.length})</span> : null}
        </h2>
        {pending.length === 0 ? (
          <EmptyState title="No pending requests" className="py-10" />
        ) : (
          <ul className="panel divide-y divide-border">
            {pending.map((m) => (
              <li key={m.profile.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <MemberLink member={m.profile} subtitle={`Requested ${formatRelative(m.joinedAt)}`} />
                <div className="flex gap-2">
                  {btn(m.profile.id, "approve", "Approve", "primary")}
                  {btn(m.profile.id, "decline", "Decline", "ghost")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-3 text-sm font-semibold tracking-wide">
          Members <span className="text-muted">({members.length})</span>
        </h2>
        <ul className="panel divide-y divide-border">
          {members.map((m) => {
            const self = m.profile.id === viewerId;
            const canAct = !self && m.role !== "owner" && (isOwner || m.role === "member");
            return (
              <li key={m.profile.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <MemberLink member={m.profile} subtitle={`Joined ${formatRelative(m.joinedAt)}`} />
                  {m.role !== "member" ? <Badge tone="accent">{m.role === "owner" ? "Owner" : "Moderator"}</Badge> : null}
                </div>
                {canAct ? (
                  <div className="flex flex-wrap gap-2">
                    {isOwner ? (m.role === "moderator" ? btn(m.profile.id, "demote", "Remove moderator") : btn(m.profile.id, "promote", "Make moderator")) : null}
                    {btn(m.profile.id, "remove", "Remove", "ghost")}
                    {btn(m.profile.id, "ban", "Ban", "danger")}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {banned.length > 0 ? (
        <section aria-labelledby="banned-h">
          <h2 id="banned-h" className="mb-3 text-sm font-semibold tracking-wide">
            Banned <span className="text-muted">({banned.length})</span>
          </h2>
          <ul className="panel divide-y divide-border">
            {banned.map((m) => (
              <li key={m.profile.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <MemberLink member={m.profile} />
                {btn(m.profile.id, "unban", "Unban")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
