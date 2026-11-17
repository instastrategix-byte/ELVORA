import { CalendarPlus, Compass, Gem, PenLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StatsSkeleton, WidgetSkeleton } from "@/components/dashboard/widgets";
import { requirePageSession } from "@backend/auth/viewer";
import { EventsSection, SetupSection } from "./personal-sections";
import {
  MarketplaceSection,
  MembershipSection,
  NetworkPostsSection,
  NotificationsSection,
  StatsSection,
  SuggestionsSection,
  WorkspacesSection,
} from "./sections";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

const QUICK_ACTIONS = [
  { href: "/feed", label: "Share an update", icon: PenLine },
  { href: "/discover", label: "Find members", icon: Compass },
  { href: "/events", label: "Browse events", icon: CalendarPlus },
  { href: "/luxury", label: "Marketplace", icon: Gem },
] as const;

/**
 * Member dashboard. Every section loads independently (Suspense + per-section error states), so
 * a slow or failing query degrades one panel instead of the page. Content is personal: it's
 * built from the viewer's own network, profile, membership and roles.
 */
export default async function HomePage() {
  const { viewer } = await requirePageSession({ next: "/home" });
  const firstName = viewer.displayName.split(/\s+/)[0] ?? viewer.displayName;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Your private office</p>
          <h1 className="display mt-2 text-4xl sm:text-5xl">
            Welcome back, <span className="text-gold italic">{firstName}</span>
          </h1>
        </div>
        <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-fg/90 transition-colors hover:border-accent/60 hover:text-fg"
            >
              <Icon className="size-4 text-accent" aria-hidden="true" /> {label}
            </Link>
          ))}
        </nav>
      </header>

      <Suspense fallback={<WidgetSkeleton rows={1} />}>
        <SetupSection />
      </Suspense>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      <Suspense fallback={null}>
        <WorkspacesSection />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Suspense fallback={<WidgetSkeleton rows={4} />}>
            <NetworkPostsSection />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton rows={2} />}>
            <EventsSection />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton rows={2} />}>
            <MarketplaceSection />
          </Suspense>
        </div>
        <div className="space-y-6">
          <Suspense fallback={<WidgetSkeleton rows={2} />}>
            <MembershipSection />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton rows={5} />}>
            <SuggestionsSection />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton rows={4} />}>
            <NotificationsSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
