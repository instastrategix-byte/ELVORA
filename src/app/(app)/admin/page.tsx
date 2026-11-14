import type { Metadata } from "next";
import Link from "next/link";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card } from "@/components/ui/primitives";
import { queueCounts, type QueueCounts } from "@backend/modules/admin/service";
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
  let counts: QueueCounts;
  try {
    counts = await queueCounts(db);
  } catch (error) {
    return <ServiceNotice error={error} what="review queues" />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {QUEUES.map((q) => (
        <li key={q.key}>
          <Link href={q.href} className="block">
            <Card className="p-6 transition-colors hover:border-accent/50">
              <p className="text-sm text-muted">{q.label}</p>
              <p className="display mt-2 text-5xl tabular-nums">{counts[q.key]}</p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
