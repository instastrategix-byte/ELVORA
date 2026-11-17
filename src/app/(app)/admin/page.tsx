import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Stat, StatsSkeleton } from "@/components/dashboard/widgets";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { platformMetrics, queueCounts, type QueueCounts } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Administration", robots: { index: false } };

const QUEUES: { key: keyof QueueCounts; label: string; href: string }[] = [
  { key: "applications", label: "Membership applications", href: "/admin/applications" },
  { key: "verifications", label: "Identity verifications", href: "/admin/verifications" },
  { key: "businesses", label: "Business verifications", href: "/admin/businesses" },
  { key: "listings", label: "Listings awaiting review", href: "/admin/listings" },
  { key: "campaigns", label: "Campaigns awaiting review", href: "/admin/campaigns" },
  { key: "reports", label: "Open reports", href: "/admin/reports" },
];

export default async function AdminPage() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin" });
  const counts = await attempt(() => queueCounts(db));
  return (
    <div className="space-y-10">
      <section aria-labelledby="queues-h">
        <h2 id="queues-h" className="mb-4 text-sm font-semibold tracking-wide">
          Review queues
        </h2>
        {!counts.ok ? (
          <ServiceNotice error={counts.error} what="review queues" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {QUEUES.map((q) => (
              <li key={q.key}>
                <Link href={q.href} className="block">
                  <Card className="p-6 transition-colors hover:border-accent/50">
                    <p className="text-sm text-muted">{q.label}</p>
                    <p className="display mt-2 text-5xl tabular-nums">{counts.data[q.key]}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="metrics-h">
        <h2 id="metrics-h" className="mb-1 text-sm font-semibold tracking-wide">
          Platform analytics
        </h2>
        <p className="mb-4 text-xs text-muted">Live counts from the database. Private correspondence (messages, enquiries) is never counted here.</p>
        <Suspense fallback={<StatsSkeleton count={10} />}>
          <Metrics />
        </Suspense>
      </section>
    </div>
  );
}

async function Metrics() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin" });
  const m = await attempt(() => platformMetrics(db));
  if (!m.ok) return <ServiceNotice error={m.error} what="platform analytics" />;
  const d = m.data;
  const pct = (n: number) => (d.members > 0 ? `${Math.round((n / d.members) * 100)}% of members` : undefined);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Stat label="Members" value={d.members} hint={d.newMembers7d > 0 ? `+${d.newMembers7d} this week` : undefined} />
      <Stat label="New (30 days)" value={d.newMembers30d} />
      <Stat label="Onboarded" value={d.onboarded} hint={pct(d.onboarded)} />
      <Stat label="Verified" value={d.verifiedMembers} hint={pct(d.verifiedMembers)} href="/admin/verifications" />
      <Stat label="Paid subscriptions" value={d.activeSubscriptions} />
      <Stat label="Complimentary grants" value={d.activeGrants} href="/admin/grants" />
      <Stat label="Posts (7 days)" value={d.posts7d} />
      <Stat label="Verified businesses" value={d.approvedBusinesses} href="/admin/businesses" />
      <Stat label="Live listings" value={d.publishedListings} href="/admin/listings" />
      <Stat label="Active campaigns" value={d.activeCampaigns} href="/admin/campaigns" />
    </div>
  );
}
