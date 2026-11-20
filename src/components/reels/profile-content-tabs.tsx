"use client";

import { Clapperboard, Newspaper } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReelGrid } from "./reel-grid";

/** Posts / Reels tabs on a member profile. Reels load only when their tab is opened. */
export function ProfileContentTabs({ authorId, isSelf, posts }: { authorId: string; isSelf: boolean; posts: ReactNode }) {
  const [tab, setTab] = useState<"posts" | "reels">("posts");
  const tabs = [
    { id: "posts", label: "Posts", icon: Newspaper },
    { id: "reels", label: "Reels", icon: Clapperboard },
  ] as const;
  return (
    <div>
      <div role="tablist" aria-label="Profile content" className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`profile-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`profile-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") setTab(tab === "posts" ? "reels" : "posts");
            }}
            tabIndex={tab === t.id ? 0 : -1}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm text-muted hover:text-fg",
              tab === t.id && "border-accent font-medium text-fg",
            )}
          >
            <t.icon className="size-4" aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>
      <div id="profile-panel-posts" role="tabpanel" aria-labelledby="profile-tab-posts" hidden={tab !== "posts"}>
        {posts}
      </div>
      <div id="profile-panel-reels" role="tabpanel" aria-labelledby="profile-tab-reels" hidden={tab !== "reels"}>
        {tab === "reels" ? <ReelGrid authorId={authorId} isSelf={isSelf} /> : null}
      </div>
    </div>
  );
}
