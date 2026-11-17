"use client";

import { Bookmark, Globe, Heart, Lock, MessageCircle, MoreHorizontal, Pencil, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MemberLink } from "@/components/social/member-card";
import { ReportButton } from "@/components/social/report-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { POST_MAX_LENGTH } from "@backend/modules/feed/schemas";
import type { PostView } from "@backend/modules/feed/types";
import { Comments } from "./comments";
import { MediaGallery } from "./media-gallery";
import { RichText } from "./rich-text";

const VISIBILITY = {
  public: { icon: Globe, label: "Public" },
  members: { icon: Users, label: "Members" },
  connections: { icon: Lock, label: "Connections" },
} as const;

export function PostCard({
  post: initial,
  canInteract,
  onDeleted,
  defaultShowComments = false,
}: {
  post: PostView;
  canInteract: boolean;
  onDeleted?: (id: string) => void;
  defaultShowComments?: boolean;
}) {
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(defaultShowComments);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const toast = useToast();
  const Vis = VISIBILITY[post.visibility];

  async function toggleLike() {
    const liked = !post.likedByViewer;
    if (liked) setPopKey((k) => k + 1);
    // Optimistic; reconciled with the server's authoritative count.
    setPost((p) => ({ ...p, likedByViewer: liked, likeCount: p.likeCount + (liked ? 1 : -1) }));
    try {
      const res = await api<{ likeCount: number }>(`/api/v1/posts/${post.id}/like`, { method: liked ? "POST" : "DELETE" });
      setPost((p) => ({ ...p, likeCount: res.likeCount }));
    } catch (e) {
      setPost((p) => ({ ...p, likedByViewer: !liked, likeCount: p.likeCount + (liked ? -1 : 1) }));
      toast.show(errorMessage(e), "error");
    }
  }

  async function toggleSave() {
    const saved = !post.savedByViewer;
    setPost((p) => ({ ...p, savedByViewer: saved }));
    try {
      await api(`/api/v1/posts/${post.id}/save`, { method: saved ? "POST" : "DELETE" });
      toast.show(saved ? "Saved" : "Removed from saved");
    } catch (e) {
      setPost((p) => ({ ...p, savedByViewer: !saved }));
      toast.show(errorMessage(e), "error");
    }
  }

  async function share() {
    const url = `${window.location.origin}/posts/${post.id}`;
    // Native share sheet on phones; clipboard elsewhere.
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ url, title: `Post by ${post.author.displayName}` });
        return;
      } catch {
        // Cancelled or unavailable: fall back to copying the link.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show(post.visibility === "public" ? "Link copied" : `Link copied — only ${Vis.label.toLowerCase()} who can see this post can open it`);
    } catch {
      toast.show("Couldn't copy the link", "error");
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const updated = await api<PostView>(`/api/v1/posts/${post.id}`, { method: "PATCH", body: { body: draft } });
      setPost(updated);
      setEditing(false);
      toast.show("Post updated");
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/posts/${post.id}`, { method: "DELETE" });
      toast.show("Post deleted");
      onDeleted?.(post.id);
    } catch (e) {
      toast.show(errorMessage(e), "error");
      setBusy(false);
    }
  }

  return (
    <article className="panel p-4 transition-colors hover:border-border-strong sm:p-5" aria-labelledby={`post-${post.id}-author`}>
      <header className="flex items-start justify-between gap-3">
        <div id={`post-${post.id}-author`} className="min-w-0">
          <MemberLink
            member={post.author}
            size={44}
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <Link href={`/posts/${post.id}`} className="hover:underline">
                  <time dateTime={post.createdAt}>{formatRelative(post.createdAt)}</time>
                </Link>
                · <Vis.icon className="size-3" aria-hidden="true" />
                <span>{Vis.label}</span>
                {post.updatedAt !== post.createdAt && new Date(post.updatedAt).getTime() - new Date(post.createdAt).getTime() > 60_000 ? <span>· edited</span> : null}
              </span>
            }
          />
        </div>
        {canInteract ? (
          post.isOwn ? (
            <Menu>
              <MenuTrigger className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Post options">
                <MoreHorizontal className="size-5" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit
                </MenuItem>
                <MenuItem onSelect={remove} className="text-danger">
                  <Trash2 /> Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          ) : (
            <ReportButton targetType="post" targetId={post.id} />
          )
        ) : null}
      </header>

      {editing ? (
        <div className="mt-4 space-y-3">
          <label htmlFor={`edit-${post.id}`} className="sr-only">
            Edit post
          </label>
          <Textarea id={`edit-${post.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={POST_MAX_LENGTH} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => (setEditing(false), setDraft(post.body))}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy || (!draft.trim() && post.media.length === 0)}>
              Save
            </Button>
          </div>
        </div>
      ) : post.body ? (
        <RichText text={post.body} className="mt-3.5" />
      ) : null}

      {post.media.length ? (
        <div className="mt-4">
          <MediaGallery media={post.media} />
        </div>
      ) : null}

      {post.likeCount > 0 || post.commentCount > 0 ? (
        <p className="mt-4 flex items-center gap-3 text-xs text-muted">
          {post.likeCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <span className="flex size-4 items-center justify-center rounded-full bg-accent text-accent-fg" aria-hidden="true">
                <Heart className="size-2.5 fill-current" />
              </span>
              {post.likeCount} {post.likeCount === 1 ? "like" : "likes"}
            </span>
          ) : null}
          {post.commentCount > 0 ? (
            <button type="button" onClick={() => setShowComments(true)} className="ml-auto hover:text-fg hover:underline">
              {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
            </button>
          ) : null}
        </p>
      ) : null}

      <footer className="mt-3 grid grid-cols-4 gap-1 border-t border-border pt-2 text-sm text-muted">
        <ActionButton onClick={toggleLike} disabled={!canInteract} pressed={post.likedByViewer} label={post.likedByViewer ? "Unlike" : "Like"}>
          <Heart key={popKey} className={cn("size-[18px]", post.likedByViewer && "animate-pop fill-accent text-accent")} />
          <span className="hidden sm:inline">{post.likedByViewer ? "Liked" : "Like"}</span>
          <span className="sr-only">{post.likeCount}</span>
        </ActionButton>
        <ActionButton onClick={() => setShowComments((s) => !s)} pressed={showComments} label="Comments">
          <MessageCircle className="size-[18px]" />
          <span className="hidden sm:inline">Comment</span>
        </ActionButton>
        <ActionButton onClick={toggleSave} disabled={!canInteract} pressed={post.savedByViewer} label={post.savedByViewer ? "Unsave" : "Save"}>
          <Bookmark className={cn("size-[18px]", post.savedByViewer && "fill-accent text-accent")} />
          <span className="hidden sm:inline">{post.savedByViewer ? "Saved" : "Save"}</span>
        </ActionButton>
        <ActionButton onClick={share} label="Share">
          <Send className="size-[18px]" />
          <span className="hidden sm:inline">Share</span>
        </ActionButton>
      </footer>

      {showComments ? (
        <Comments postId={post.id} canComment={canInteract} onCountChange={(delta) => setPost((p) => ({ ...p, commentCount: Math.max(0, p.commentCount + delta) }))} />
      ) : null}
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  pressed,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      className={cn(
        "pressable inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2 font-medium transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50 aria-pressed:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
