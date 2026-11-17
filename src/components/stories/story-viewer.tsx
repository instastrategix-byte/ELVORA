"use client";

import { ChevronLeft, ChevronRight, Eye, Lock, Pause, Play, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Dialog as D } from "radix-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoryAuthorGroup, StoryViewer as StoryViewerRow } from "@backend/modules/stories/types";

const IMAGE_MS = 5000;
/** A press shorter than this is a tap (navigate); longer is a hold (pause). */
const TAP_MS = 220;

type Props = {
  groups: StoryAuthorGroup[];
  open: boolean;
  startGroup: number;
  onOpenChange: (open: boolean) => void;
  onSeen: (storyId: string) => void;
  onDeleted: (storyId: string) => void;
};

function firstUnseen(group: StoryAuthorGroup | undefined): number {
  if (!group) return 0;
  const i = group.stories.findIndex((s) => !s.seen);
  return i === -1 ? 0 : i;
}

/**
 * Full-screen story player: per-story progress bars, auto-advance (5s for photos, the clip's
 * length for videos), tap or arrow keys to move, hold or Space to pause. Views are recorded
 * once per story. Authors see the view count and can delete.
 */
export function StoryViewer({ groups, open, startGroup, onOpenChange, onSeen, onDeleted }: Props) {
  const toast = useToast();
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(() => firstUnseen(groups[startGroup]));
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pressStart = useRef(0);
  const recorded = useRef(new Set<string>());

  const group = groups[gi];
  const story = group?.stories[si];

  // Reset position whenever the viewer is (re)opened on a group.
  useEffect(() => {
    if (!open) return;
    setGi(startGroup);
    setSi(firstUnseen(groups[startGroup]));
    // groups intentionally omitted: only a new open/start should reposition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startGroup]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const next = useCallback(() => {
    if (!group) return close();
    if (si < group.stories.length - 1) return setSi(si + 1);
    if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(firstUnseen(groups[gi + 1]));
      return;
    }
    close();
  }, [group, si, gi, groups, close]);

  const prev = useCallback(() => {
    if (si > 0) return setSi(si - 1);
    if (gi > 0) {
      setGi(gi - 1);
      setSi(Math.max(0, (groups[gi - 1]?.stories.length ?? 1) - 1));
      return;
    }
    setProgress(0);
  }, [si, gi, groups]);

  // New story: restart progress, clear the viewers panel, record the view once.
  useEffect(() => {
    setProgress(0);
    setPaused(false);
    setViewers(null);
    if (!open || !story || story.isOwn || story.seen || recorded.current.has(story.id)) return;
    recorded.current.add(story.id);
    onSeen(story.id);
    api(`/api/v1/stories/${story.id}/view`, { method: "POST" }).catch(() => recorded.current.delete(story.id));
  }, [open, story, onSeen]);

  // Photo timer (videos report progress from the element itself).
  useEffect(() => {
    if (!open || !story || story.mediaType !== "image" || paused || viewers) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = now - last;
      last = now;
      setProgress((p) => {
        const n = p + dt / IMAGE_MS;
        return n >= 1 ? 1 : n;
      });
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, story, paused, viewers]);

  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);

  // Keep the video's play state in sync with pause/hold.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused || viewers) v.pause();
    else v.play().catch(() => setPaused(true));
  }, [paused, viewers, story]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === " ") {
      e.preventDefault();
      setPaused((p) => !p);
    }
  }

  async function remove() {
    if (!story || !window.confirm("Delete this story? This can't be undone.")) return;
    setBusy(true);
    try {
      await api(`/api/v1/stories/${story.id}`, { method: "DELETE" });
      toast.show("Story deleted.", "success");
      onDeleted(story.id);
      if (group && group.stories.length <= 1) close();
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function showViewers() {
    if (!story) return;
    if (viewers) return setViewers(null);
    try {
      setViewers(await api<StoryViewerRow[]>(`/api/v1/stories/${story.id}/viewers`));
    } catch (e) {
      toast.show(errorMessage(e), "error");
    }
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/95 data-[state=open]:animate-fade-in" />
        <D.Content
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex items-center justify-center outline-none data-[state=open]:animate-fade-in"
        >
          <D.Title className="sr-only">{group ? `Stories from ${group.author.displayName}` : "Stories"}</D.Title>
          {group && story ? (
            <div className="relative flex h-full w-full max-w-[min(100vw,calc(100dvh*9/16))] flex-col overflow-hidden bg-black sm:h-[92dvh] sm:rounded-2xl sm:border sm:border-white/10">
              {/* Progress */}
              <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-3" aria-hidden="true">
                {group.stories.map((s, i) => (
                  <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
                    <span className="block h-full bg-white" style={{ width: `${i < si ? 100 : i === si ? Math.round(progress * 100) : 0}%` }} />
                  </span>
                ))}
              </div>

              {/* Header */}
              <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pt-6 pb-10 text-white">
                <Link href={group.author.handle ? `/members/${group.author.handle}` : "#"} className="flex min-w-0 items-center gap-2.5" onClick={close}>
                  <Avatar src={group.author.avatarUrl} name={group.author.displayName} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{group.isOwn ? "Your story" : group.author.displayName}</span>
                    <span className="flex items-center gap-1 text-xs text-white/70">
                      {formatRelative(story.createdAt)}
                      {story.visibility === "connections" ? (
                        <>
                          · <Lock className="size-3" aria-hidden="true" /> Connections
                        </>
                      ) : null}
                    </span>
                  </span>
                </Link>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    className="rounded-full p-2 hover:bg-white/10"
                    aria-label={paused ? "Play" : "Pause"}
                  >
                    {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
                  </button>
                  <D.Close className="rounded-full p-2 hover:bg-white/10" aria-label="Close stories">
                    <X className="size-5" />
                  </D.Close>
                </div>
              </div>

              {/* Media + tap zones */}
              <div
                className="relative flex flex-1 touch-none items-center justify-center select-none"
                onPointerDown={() => {
                  pressStart.current = performance.now();
                  setPaused(true);
                }}
                onPointerUp={(e) => {
                  const held = performance.now() - pressStart.current;
                  setPaused(false);
                  if (held > TAP_MS) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (e.clientX - rect.left < rect.width / 3) prev();
                  else next();
                }}
                onPointerLeave={() => setPaused(false)}
              >
                {story.mediaUrl ? (
                  story.mediaType === "video" ? (
                    <video
                      key={story.id}
                      ref={videoRef}
                      src={story.mediaUrl}
                      className="max-h-full w-full object-contain"
                      autoPlay
                      playsInline
                      muted
                      onTimeUpdate={(e) => {
                        const v = e.currentTarget;
                        if (v.duration > 0) setProgress(Math.min(0.999, v.currentTime / v.duration));
                      }}
                      onEnded={next}
                    />
                  ) : (
                    // Signed private-bucket URL; next/image can't optimise short-lived signed URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={story.id} src={story.mediaUrl} alt={story.caption ?? `Story from ${group.author.displayName}`} className="max-h-full w-full object-contain" draggable={false} />
                  )
                ) : (
                  <p className="px-8 text-center text-sm text-white/70">This story&apos;s media couldn&apos;t be loaded.</p>
                )}
              </div>

              {/* Caption + owner tools */}
              <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/85 to-transparent px-4 pt-12 pb-[max(1rem,env(safe-area-inset-bottom))] text-white">
                {story.caption ? <p className="text-sm leading-6">{story.caption}</p> : null}
                {story.isOwn ? (
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={showViewers} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm hover:bg-white/10" aria-expanded={Boolean(viewers)}>
                      <Eye className="size-4" aria-hidden="true" /> {story.viewCount ?? 0} {story.viewCount === 1 ? "view" : "views"}
                    </button>
                    <button
                      type="button"
                      onClick={remove}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden="true" /> Delete
                    </button>
                  </div>
                ) : null}
                {viewers ? (
                  <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-white/10 p-3 text-sm">
                    {viewers.length === 0 ? <li className="text-white/70">No views yet.</li> : null}
                    {viewers.map((v) => (
                      <li key={v.profile.id} className="flex items-center gap-2">
                        <Avatar src={v.profile.avatarUrl} name={v.profile.displayName} size={26} />
                        <span className="truncate">{v.profile.displayName}</span>
                        <span className="ml-auto shrink-0 text-xs text-white/60">{formatRelative(v.viewedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {/* Desktop arrows */}
              <button
                type="button"
                onClick={prev}
                className={cn("absolute top-1/2 left-2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:block", gi === 0 && si === 0 && "invisible")}
                aria-label="Previous story"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={next} className="absolute top-1/2 right-2 z-20 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 sm:block" aria-label="Next story">
                <ChevronRight className="size-5" />
              </button>
            </div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
