import Link from "next/link";
import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, EmptyState } from "@/components/ui/primitives";
import { CATEGORY_LABELS } from "@backend/modules/listings/schemas";
import { listingQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function ListingsQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/listings" });
  let items;
  try {
    items = await listingQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="listing reviews" />;
  }
  if (!items.length) return <EmptyState title="No listings waiting for review" />;
  return (
    <ul className="space-y-4">
      {items.map((l) => (
        <li key={l.id}>
          <Card className="space-y-4 p-6">
            <div>
              <Link href={`/luxury/${l.slug}`} className="display text-2xl hover:text-accent">
                {l.title}
              </Link>
              <p className="text-sm text-muted">
                {CATEGORY_LABELS[l.category]} · {l.businessName} · {[l.city, l.country].filter(Boolean).join(", ")}
              </p>
              {l.summary ? <p className="mt-2 text-sm">{l.summary}</p> : null}
            </div>
            <ReviewActions
              endpoint={`/api/v1/admin/listings/${l.id}`}
              options={[
                { label: "Approve & publish", body: { approve: true } },
                { label: "Reject", body: { approve: false }, variant: "danger", requireNote: true },
              ]}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
