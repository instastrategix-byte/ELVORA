"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";

/** Archive hides a community from discovery and stops new posts; members keep read access. */
export function ArchiveButton({ communityId, archived }: { communityId: string; archived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const action = useAction(() => api(`/api/v1/communities/${communityId}/archive`, { method: "POST", body: { archived: !archived } }));

  async function onClick() {
    const text = archived
      ? "Restore this community? It will reappear in discovery and members can post again."
      : "Archive this community? It disappears from discovery and nobody can post, but members can still read it.";
    if (!window.confirm(text)) return;
    const r = await action.run();
    if (r === undefined) return;
    toast.show(archived ? "Community restored" : "Community archived");
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <Button variant={archived ? "outline" : "danger"} onClick={onClick} disabled={action.pending}>
        {action.pending ? "Saving…" : archived ? "Restore community" : "Archive community"}
      </Button>
      {action.error ? (
        <p role="alert" className="text-xs text-danger">
          {action.error}
        </p>
      ) : null}
    </div>
  );
}
