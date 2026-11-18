import type { Metadata } from "next";
import Link from "next/link";
import { SponsoredSlot } from "@/components/ads/sponsored-slot";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostList } from "@/components/feed/post-list";
import { Alert } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { publicMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listFeed } from "@backend/modules/feed/service";
import { requirePageSession } from "@backend/auth/viewer";
import { isAiConfigured } from "@backend/modules/ai/service";
import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/dashboard/widgets";
import { EventsSection } from "../home/personal-sections";
import { SuggestionsSection, TrendingSection } from "../home/sections";
import { StoriesSection } from "../home/stories-section";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { viewer, db } = await requirePageSession({ next: "/feed" });
  const sp = await searchParams;
  const scope = sp.scope === "all" ? "all" : "network";
  const canPost = hasFeature(viewer, "feed.post");

  const result = await attempt(() => listFeed(db, viewer, { scope }));
  const content = !result.ok ? (
    <ServiceNotice error={result.error} what="your feed" />
  ) : (
    <PostList
      key={scope}
      initial={result.data}
      endpoint={`/api/v1/feed?scope=${scope}`}
      canInteract
      composer={
        canPost
          ? {
              authorName: viewer.displayName,
              avatarUrl: publicMediaUrl("profile-media", viewer.avatarPath),
              aiEnabled: isAiConfigured(),
            }
          : undefined
      }
      header={<SponsoredSlot placement="feed" />}
      emptyTitle={
        scope === "network" ? "Your network is quiet" : "No posts yet"
      }
      emptyDescription={
        scope === "network"
          ? "Connect with or follow members to see their updates here, or switch to Everyone."
          : "Be the first to share an update."
      }
    />
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="display text-4xl">Feed</h1>
          <div
            role="tablist"
            aria-label="Feed scope"
            className="flex rounded-full border border-border p-1 text-sm"
          >
            {(["network", "all"] as const).map((s) => (
              <Link
                key={s}
                role="tab"
                aria-selected={scope === s}
                href={s === "network" ? "/feed" : "/feed?scope=all"}
                className={cn(
                  "rounded-full px-4 py-1.5 transition-colors",
                  scope === s ? "bg-fg text-bg" : "text-muted hover:text-fg",
                )}
              >
                {s === "network" ? "My network" : "Everyone"}
              </Link>
            ))}
          </div>
        </div>
        <Suspense fallback={null}>
          <StoriesSection />
        </Suspense>
        {!canPost ? (
          <Alert tone="info">
            Posting isn&apos;t available on your account right now.
          </Alert>
        ) : null}
        {content}
      </div>
      <aside
        aria-label="Suggestions"
        className="hidden space-y-5 xl:sticky xl:top-24 xl:block xl:self-start"
      >
        <Suspense fallback={<WidgetSkeleton rows={3} />}>
          <SuggestionsSection />
        </Suspense>
        <Suspense fallback={null}>
          <TrendingSection />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton rows={2} />}>
          <EventsSection />
        </Suspense>
      </aside>
    </div>
  );
}
