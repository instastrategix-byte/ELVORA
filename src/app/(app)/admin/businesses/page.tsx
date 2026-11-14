import { FileText } from "lucide-react";
import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Card, EmptyState } from "@/components/ui/primitives";
import { titleCase } from "@/lib/format";
import { businessQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function BusinessesQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/businesses" });
  let items;
  try {
    items = await businessQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="business reviews" />;
  }
  if (!items.length) return <EmptyState title="No businesses waiting for verification" />;
  return (
    <ul className="space-y-4">
      {items.map((b) => (
        <li key={b.id}>
          <Card className="space-y-4 p-6">
            <div>
              <p className="display text-2xl">{b.name}</p>
              <p className="text-sm text-muted">
                {[titleCase(b.category), b.location, b.registrationNumber ? `Reg. ${b.registrationNumber}` : null].filter(Boolean).join(" · ")}
              </p>
              {b.website ? (
                <a href={b.website} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent hover:underline">
                  {b.website}
                </a>
              ) : null}
            </div>
            <MemberLink member={b.owner} subtitle="Owner" />
            {b.description ? <p className="text-sm whitespace-pre-line">{b.description}</p> : null}
            <ul className="flex flex-wrap gap-2">
              {b.documents.map((d, i) => (
                <li key={d.path}>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent">
                      <FileText className="size-4" aria-hidden="true" /> Document {i + 1}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <ReviewActions
              endpoint={`/api/v1/admin/businesses/${b.id}`}
              options={[
                { label: "Verify business", body: { status: "approved" } },
                { label: "Reject", body: { status: "rejected" }, variant: "danger", requireNote: true },
              ]}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
