"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import type { CommunityMemberStatus, CommunityRole, CommunityVisibility } from "@backend/modules/communities/types";

/** Join / request / leave / withdraw, reflecting the member's real state. Owners manage instead. */
export function MembershipButton({
  communityId,
  visibility,
  status,
  role,
  archived,
}: {
  communityId: string;
  visibility: CommunityVisibility;
  status: CommunityMemberStatus | null;
  role: CommunityRole | null;
  archived: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const join = useAction(() => api<{ status: CommunityMemberStatus }>(`/api/v1/communities/${communityId}/membership`, { method: "POST" }));
  const leave = useAction(() => api(`/api/v1/communities/${communityId}/membership`, { method: "DELETE" }));
  const pending = join.pending || leave.pending;
  const error = join.error ?? leave.error;

  async function onJoin() {
    const r = await join.run();
    if (!r) return;
    toast.show(r.status === "pending" ? "Request sent. A moderator will review it." : "Welcome to the community");
    router.refresh();
  }

  async function onLeave(message: string, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    const r = await leave.run();
    if (r === undefined) return;
    toast.show(message);
    router.refresh();
  }

  if (role === "owner" || status === "banned") return null;

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      {status === "active" ? (
        <Button variant="outline" disabled={pending} onClick={() => onLeave("You left the community", "Leave this community?")}>
          {leave.pending ? "Leaving…" : "Leave"}
        </Button>
      ) : status === "pending" ? (
        <Button variant="outline" disabled={pending} onClick={() => onLeave("Request withdrawn", "Withdraw your request to join?")}>
          {leave.pending ? "Withdrawing…" : "Withdraw request"}
        </Button>
      ) : archived ? null : (
        <Button disabled={pending} onClick={onJoin}>
          {join.pending ? "Joining…" : visibility === "private" ? "Request to join" : "Join community"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
