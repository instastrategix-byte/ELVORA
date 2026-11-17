"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { StoryAuthorGroup } from "@backend/modules/stories/types";
import { StoryComposer } from "./story-composer";
import { StoryViewer } from "./story-viewer";

const AVATAR = 64;

/**
 * Horizontal story carousel. The first tile is the viewer's own story (or "Add story" when they
 * can post). Unseen stories get a champagne ring; seen ones a hairline. Scroll-snapped on touch,
 * with arrow buttons on wider screens.
 */
export function StoryRail({ groups: initial, canPost }: { groups: StoryAuthorGroup[]; canPost: boolean }) {
  const router = useRouter();
  const scroller = useRef<HTMLUListElement>(null);
  const [groups, setGroups] = useState(initial);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [startGroup, setStartGroup] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Server refreshes (after posting or deleting) replace local state; derived during render.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setGroups(initial);
  }

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, groups]);

  const own = groups.find((g) => g.isOwn);
  const others = groups.filter((g) => !g.isOwn);
  function open(group: StoryAuthorGroup) {
    setStartGroup(groups.indexOf(group));
    setViewerOpen(true);
  }

  const onSeen = useCallbackStable((storyId: string) => {
    setGroups((gs) =>
      gs.map((g) => {
        if (!g.stories.some((s) => s.id === storyId)) return g;
        const stories = g.stories.map((s) => (s.id === storyId ? { ...s, seen: true } : s));
        return { ...g, stories, hasUnseen: stories.some((s) => !s.seen) };
      }),
    );
  });

  const onDeleted = useCallbackStable((storyId: string) => {
    setGroups((gs) => gs.map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) })).filter((g) => g.stories.length > 0));
    router.refresh();
  });

  if (!own && others.length === 0 && !canPost) return null;

  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section aria-label="Stories" className="relative">
      <ul ref={scroller} onScroll={measure} className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-reduce:scroll-auto">
        {own || canPost ? (
          <li className="snap-start">
            <div className="relative flex w-[76px] flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => (own ? open(own) : setComposerOpen(true))}
                className="rounded-full focus-visible:outline-offset-4"
                aria-label={own ? "View your story" : "Add to your story"}
              >
                <Ring unseen={false} hasStory={Boolean(own)}>
                  {own ? (
                    <Avatar src={own.author.avatarUrl} name={own.author.displayName} size={AVATAR} />
                  ) : (
                    <span className="flex items-center justify-center rounded-full border border-dashed border-border-strong bg-surface-2 text-muted" style={{ width: AVATAR, height: AVATAR }}>
                      <Plus className="size-6" aria-hidden="true" />
                    </span>
                  )}
                </Ring>
              </button>
              {own && canPost ? (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="absolute top-[50px] right-1 flex size-6 items-center justify-center rounded-full border-2 border-bg bg-accent text-accent-fg transition-transform hover:scale-110"
                  aria-label="Add another story"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
              <span className="w-full truncate text-center text-xs text-muted">{own ? "Your story" : "Add story"}</span>
            </div>
          </li>
        ) : null}

        {others.map((g) => (
          <li key={g.author.id} className="snap-start">
            <button type="button" onClick={() => open(g)} className="flex w-[76px] flex-col items-center gap-1.5 rounded-xl" aria-label={`${g.author.displayName}'s story${g.hasUnseen ? ", new" : ""}`}>
              <Ring unseen={g.hasUnseen} hasStory>
                <Avatar src={g.author.avatarUrl} name={g.author.displayName} size={AVATAR} />
              </Ring>
              <span className={cn("w-full truncate text-center text-xs", g.hasUnseen ? "text-fg" : "text-muted")}>{g.author.displayName.split(/\s+/)[0]}</span>
            </button>
          </li>
        ))}

        {others.length === 0 ? (
          <li className="flex min-w-0 items-center self-center pr-2 text-sm text-muted">
            {canPost ? "No stories from your network yet. Share a moment from your day." : "No stories from your network yet."}
          </li>
        ) : null}
      </ul>

      {edges.left ? (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="absolute top-7 -left-3 hidden size-8 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-[var(--shadow-soft)] hover:border-accent sm:flex"
          aria-label="Scroll stories left"
        >
          <ChevronLeft className="size-4" />
        </button>
      ) : null}
      {edges.right ? (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="absolute top-7 -right-3 hidden size-8 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-[var(--shadow-soft)] hover:border-accent sm:flex"
          aria-label="Scroll stories right"
        >
          <ChevronRight className="size-4" />
        </button>
      ) : null}

      <StoryViewer groups={groups} open={viewerOpen} startGroup={startGroup} onOpenChange={setViewerOpen} onSeen={onSeen} onDeleted={onDeleted} />
      {canPost ? <StoryComposer open={composerOpen} onOpenChange={setComposerOpen} onPosted={() => router.refresh()} /> : null}
    </section>
  );
}

function Ring({ unseen, hasStory, children }: { unseen: boolean; hasStory: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "block rounded-full p-[3px] transition-transform duration-200 hover:scale-[1.04] motion-reduce:transition-none",
        !hasStory ? "" : unseen ? "bg-[conic-gradient(from_210deg,var(--accent-strong),var(--accent),var(--gold-3),var(--accent-strong))]" : "bg-border",
      )}
    >
      <span className="block rounded-full bg-bg p-[2px]">{children}</span>
    </span>
  );
}

/** Stable callback identity that always calls the latest closure (avoids re-running viewer effects). */
function useCallbackStable<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
