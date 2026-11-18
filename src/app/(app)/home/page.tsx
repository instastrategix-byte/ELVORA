import type { Metadata } from "next";
import { Suspense } from "react";
import { WidgetSkeleton } from "@/components/dashboard/widgets";
import { Skeleton } from "@/components/ui/primitives";
import { requirePageSession } from "@backend/auth/viewer";
import { FeedSection } from "./feed-section";
import { IdentityCard } from "./identity";
import { ProfileInsightsSection } from "./insights-section";
import { EventsSection } from "./personal-sections";
import { MarketplaceSection, MembershipSection, SuggestionsSection, TrendingSection, WorkspacesSection } from "./sections";
import { StoriesSection } from "./stories-section";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

/**
 * Member home: a three-column layout on desktop (app navigation · feed · personal rail) that
 * collapses to a single column on tablets and phones, where the rail follows the feed.
 * Each panel streams independently, so one slow query never blocks the page.
 */
export default async function HomePage() {
  await requirePageSession({ next: "/home" });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <h1 className="sr-only">Home</h1>
        <Suspense fallback={<StoriesSkeleton />}>
          <StoriesSection />
        </Suspense>
        <Suspense fallback={<FeedSkeleton />}>
          <FeedSection />
        </Suspense>
      </div>

      <aside aria-label="Your overview" className="space-y-5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto xl:pb-6 xl:scrollbar-none">
        <div className="hidden xl:block">
          <Suspense fallback={<WidgetSkeleton rows={2} />}>
            <IdentityCard />
          </Suspense>
        </div>
        <Suspense fallback={<WidgetSkeleton rows={1} />}>
          <ProfileInsightsSection />
        </Suspense>
        <Suspense fallback={null}>
          <WorkspacesSection />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton rows={3} />}>
          <SuggestionsSection />
        </Suspense>
        <Suspense fallback={null}>
          <TrendingSection />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton rows={2} />}>
          <EventsSection />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton rows={2} />}>
          <MembershipSection />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton rows={3} />}>
          <MarketplaceSection />
        </Suspense>
        <p className="px-1 text-[11px] leading-5 text-muted/80">
          <a href="/about" className="hover:text-fg">About</a> · <a href="/help" className="hover:text-fg">Help</a> ·{" "}
          <a href="/privacy" className="hover:text-fg">Privacy</a> · <a href="/terms" className="hover:text-fg">Terms</a> ·{" "}
          <a href="/community-guidelines" className="hover:text-fg">Guidelines</a>
        </p>
      </aside>
    </div>
  );
}

function StoriesSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden" aria-busy="true" aria-label="Loading stories">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-2">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading feed">
      {[0, 1].map((i) => (
        <div key={i} className="panel space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
