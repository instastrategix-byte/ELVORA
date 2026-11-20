"use client";

import { Clapperboard, Heart, Lock, MessageCircle, MoreHorizontal, Pause, Play, Plus, Send, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { compactCount, type ReelView } from "@backend/modules/reels/types";
import { ReelComments } from "./reel-comments";
import { ReelMoreSheet } from "./reel-more";
import { ReelShareDialog } from "./reel-share";

type Page = { items: ReelView[]; hasMore: boolean };

/** Watching at least this long (or half of a very short reel) counts as a view. */
const VIEW_AFTER_SECONDS = 2;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Full-height vertical reel player. One reel plays at a time (the one most in view); it starts
 * muted, and a tap toggles sound for every reel. Double-tap likes. ↑/↓ (or J/K) move between
 * reels. Playback pauses when the tab is hidden. With reduced motion, nothing autoplays.
 */
export function ReelFeed({
  initial,
  initialHasMore,
  canInteract,
  openCommentsFor,
  emptyAction = true,
}: {
  initial: ReelView[];
  initialHasMore: boolean;
  canInteract: boolean;
  /** Opens the comments sheet for this reel on load (from a notification link). */
  openCommentsFor?: string;
  emptyAction?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(openCommentsFor ?? null);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const loading = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  const update = useCallback((id: string, patch: Partial<ReelView>) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  // The slide most in view is the active one.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Load the next page a few reels before the end.
  useEffect(() => {
    if (!hasMore || loading.current || active < items.length - 3) return;
    loading.current = true;
    const exclude = items.map((r) => r.id).join(",");
    api<Page>(`/api/v1/reels?exclude=${exclude}`)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items.filter((r) => !prev.some((p) => p.id === r.id))]);
        setHasMore(page.hasMore && page.items.length > 0);
      })
      .catch(() => setHasMore(false))
      .finally(() => {
        loading.current = false;
      });
  }, [active, hasMore, items]);

  const go = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(active + delta, 0), items.length - 1);
      container.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [active, items.length, reduced],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "m") {
      setMuted((m) => !m);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Clapperboard />}
        title="No reels yet"
        description="Short videos from members you can see will appear here."
        action={
          emptyAction && canInteract ? (
            <Button asChild>
              <Link href="/reels/new">
                <Plus /> Create a reel
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <div
        ref={container}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Reels. Use the up and down arrow keys to move between reels."
        className="scrollbar-none h-[calc(100dvh-10rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-accent lg:h-[calc(100dvh-8.5rem)]"
      >
        {items.map((reel, index) => (
          <section key={reel.id} data-index={index} aria-label={`Reel by ${reel.author.displayName}`} className="flex h-full snap-start snap-always items-center justify-center py-2">
            <ReelSlide
              reel={reel}
              active={index === active && !hidden}
              nearby={Math.abs(index - active) <= 1}
              autoplay={!reduced}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              canInteract={canInteract}
              onUpdate={(patch) => update(reel.id, patch)}
              onComments={() => setCommentsFor(reel.id)}
              onShare={() => setShareFor(reel.id)}
              onMore={() => setMoreFor(reel.id)}
            />
          </section>
        ))}
      </div>

      {commentsFor ? (
        <ReelComments
          reelId={commentsFor}
          canInteract={canInteract}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) => {
            const r = items.find((x) => x.id === commentsFor);
            if (r) update(r.id, { commentCount: Math.max(0, r.commentCount + delta) });
          }}
        />
      ) : null}
      {shareFor ? (
        <ReelShareDialog
          reelId={shareFor}
          canSend={canInteract}
          onClose={() => setShareFor(null)}
          onShared={(n) => {
            const r = items.find((x) => x.id === shareFor);
            if (r) update(r.id, { shareCount: r.shareCount + n });
          }}
        />
      ) : null}
      {moreFor ? (
        <ReelMoreSheet
          reel={items.find((r) => r.id === moreFor)!}
          onClose={() => setMoreFor(null)}
          onDeleted={() => {
            setItems((prev) => prev.filter((r) => r.id !== moreFor));
            setMoreFor(null);
          }}
        />
      ) : null}
    </>
  );
}

function ReelSlide({
  reel,
  active,
  nearby,
  autoplay,
  muted,
  onToggleMute,
  canInteract,
  onUpdate,
  onComments,
  onShare,
  onMore,
}: {
  reel: ReelView;
  active: boolean;
  nearby: boolean;
  autoplay: boolean;
  muted: boolean;
  onToggleMute: () => void;
  canInteract: boolean;
  onUpdate: (patch: Partial<ReelView>) => void;
  onComments: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(!autoplay);
  const [heart, setHeart] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const viewed = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshed = useRef(false);
  const liking = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && autoplay && !paused) {
      void v.play().catch(() => setPaused(true));
    } else {
      v.pause();
    }
  }, [active, autoplay, paused]);

  // When a reel scrolls out of view, reset it so it autoplays again on return.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setPaused(!autoplay);
  }

  function onTimeUpdate() {
    const v = video.current;
    if (!v || viewed.current || !active) return;
    if (v.currentTime >= Math.min(VIEW_AFTER_SECONDS, (v.duration || reel.durationS) / 2)) {
      viewed.current = true;
      if (!reel.isOwn) {
        void api(`/api/v1/reels/${reel.id}/view`, { method: "POST" })
          .then(() => onUpdate({ viewCount: reel.viewCount + 1 }))
          .catch(() => undefined);
      }
    }
  }

  // Signed URLs expire; on a load error fetch fresh ones once.
  async function onError() {
    if (refreshed.current) return;
    refreshed.current = true;
    try {
      const fresh = await api<ReelView>(`/api/v1/reels/${reel.id}`);
      onUpdate({ videoUrl: fresh.videoUrl, posterUrl: fresh.posterUrl });
    } catch {
      // leave the poster showing
    }
  }

  async function setLike(like: boolean) {
    if (!canInteract || liking.current || like === reel.likedByViewer) return;
    liking.current = true;
    onUpdate({ likedByViewer: like, likeCount: Math.max(0, reel.likeCount + (like ? 1 : -1)) });
    try {
      const r = await api<{ liked: boolean; likeCount: number }>(`/api/v1/reels/${reel.id}/like`, { method: like ? "POST" : "DELETE" });
      onUpdate({ likedByViewer: r.liked, likeCount: r.likeCount });
    } catch {
      onUpdate({ likedByViewer: reel.likedByViewer, likeCount: reel.likeCount });
    } finally {
      liking.current = false;
    }
  }

  function onTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setHeart((h) => h + 1);
      void setLike(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      if (!autoplay || paused) setPaused((p) => !p);
      else onToggleMute();
    }, 280);
  }

  const aspect = reel.width && reel.height ? `${reel.width} / ${reel.height}` : "9 / 16";

  return (
    <div className="relative flex h-full max-w-full items-end gap-3">
      <div className="relative h-full max-w-[calc(100vw-5.5rem)] overflow-hidden rounded-3xl bg-black shadow-[var(--shadow-lift)]" style={{ aspectRatio: aspect }}>
        {reel.videoUrl ? (
          <video
            ref={video}
            src={nearby ? reel.videoUrl : undefined}
            poster={reel.posterUrl ?? undefined}
            muted={muted}
            loop
            playsInline
            preload={active ? "auto" : "metadata"}
            onTimeUpdate={onTimeUpdate}
            onError={onError}
            className="size-full object-cover"
            aria-label={reel.caption ? `Reel: ${reel.caption.slice(0, 120)}` : `Reel by ${reel.author.displayName}`}
          />
        ) : (
          <p className="flex size-full items-center justify-center p-6 text-center text-sm text-white/70">This video couldn&apos;t be loaded.</p>
        )}

        <button
          type="button"
          onClick={onTap}
          className="absolute inset-0 cursor-pointer"
          aria-label={paused || !autoplay ? "Play or pause" : muted ? "Turn sound on" : "Turn sound off"}
        />

        {heart ? (
          <Heart
            key={heart}
            aria-hidden="true"
            className="animate-pop pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow-lg [animation-fill-mode:forwards] motion-reduce:hidden"
            onAnimationEnd={() => setHeart(0)}
          />
        ) : null}

        {paused && active ? (
          <span className="pointer-events-none absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
            <Play className="size-7 fill-white" aria-hidden="true" />
          </span>
        ) : null}

        <button
          type="button"
          onClick={onToggleMute}
          className="absolute top-3 right-3 rounded-full bg-black/45 p-2 text-white backdrop-blur hover:bg-black/60"
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        {!autoplay ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="absolute top-3 left-3 rounded-full bg-black/45 p-2 text-white backdrop-blur hover:bg-black/60"
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        ) : null}

        {reel.status !== "published" ? (
          <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-danger px-3 py-1 text-xs font-medium text-white">
            {reel.status === "removed" ? "Removed by moderators" : "Hidden by moderators"}
          </p>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-16 text-white">
          <Link href={`/members/${reel.author.handle}`} className="pointer-events-auto inline-flex items-center gap-2">
            <Avatar src={reel.author.avatarUrl} name={reel.author.displayName} size={34} />
            <span className="text-sm font-semibold">{reel.author.displayName}</span>
            <VerifiedBadges kinds={reel.author.verifiedKinds} compact />
            {reel.visibility === "connections" ? <Lock className="size-3.5 opacity-80" aria-label="Connections only" /> : null}
          </Link>
          {reel.caption ? (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className={cn("pointer-events-auto mt-2 block text-left text-sm leading-5 whitespace-pre-line", !expanded && "line-clamp-2")}
              aria-expanded={expanded}
            >
              {reel.caption}
            </button>
          ) : null}
          <p className="mt-1 text-xs text-white/70">{compactCount(reel.viewCount)} views</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 pb-4">
        <SideAction
          label={reel.likedByViewer ? "Unlike" : "Like"}
          count={reel.likeCount}
          pressed={reel.likedByViewer}
          disabled={!canInteract}
          onClick={() => setLike(!reel.likedByViewer)}
        >
          <Heart className={cn("size-6 transition-transform", reel.likedByViewer && "scale-110 fill-danger text-danger")} />
        </SideAction>
        <SideAction label="Comments" count={reel.commentCount} onClick={onComments}>
          <MessageCircle className="size-6" />
        </SideAction>
        <SideAction label="Share" count={reel.shareCount} onClick={onShare}>
          <Send className="size-6" />
        </SideAction>
        <SideAction label="More options" onClick={onMore}>
          <MoreHorizontal className="size-6" />
        </SideAction>
      </div>
    </div>
  );
}

function SideAction({
  label,
  count,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  count?: number;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className="pressable flex size-11 items-center justify-center rounded-full border border-border bg-surface text-fg hover:bg-surface-2 disabled:opacity-50"
      >
        {children}
      </button>
      {count !== undefined ? <span className="text-xs text-muted tabular-nums">{compactCount(count)}</span> : null}
    </div>
  );
}
