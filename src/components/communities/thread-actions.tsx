"use client";

import { Lock, LockOpen, MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";

/** Moderators pin, lock and delete; authors delete their own. The database enforces both. */
export function ThreadActions({
  threadId,
  slug,
  pinned,
  locked,
  canModerate,
  isOwn,
}: {
  threadId: string;
  slug: string;
  pinned: boolean;
  locked: boolean;
  canModerate: boolean;
  isOwn: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  if (!canModerate && !isOwn) return null;

  async function patch(body: { pinned?: boolean; locked?: boolean }, message: string) {
    try {
      await api(`/api/v1/community-threads/${threadId}`, { method: "PATCH", body });
      toast.show(message);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this discussion and all its replies? This cannot be undone.")) return;
    try {
      await api(`/api/v1/community-threads/${threadId}`, { method: "DELETE" });
      toast.show("Discussion deleted");
      router.push(`/communities/${slug}`);
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <Menu>
      <MenuTrigger className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Discussion options">
        <MoreHorizontal className="size-5" />
      </MenuTrigger>
      <MenuContent>
        {canModerate ? (
          <>
            <MenuItem onSelect={() => patch({ pinned: !pinned }, pinned ? "Unpinned" : "Pinned to the top")}>
              {pinned ? <PinOff /> : <Pin />} {pinned ? "Unpin" : "Pin"}
            </MenuItem>
            <MenuItem onSelect={() => patch({ locked: !locked }, locked ? "Replies reopened" : "Replies locked")}>
              {locked ? <LockOpen /> : <Lock />} {locked ? "Unlock replies" : "Lock replies"}
            </MenuItem>
          </>
        ) : null}
        <MenuItem onSelect={remove} className="text-danger">
          <Trash2 /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
