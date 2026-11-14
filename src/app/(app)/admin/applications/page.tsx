import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { MemberLink } from "@/components/social/member-card";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDate, titleCase } from "@/lib/format";
import { applicationQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function ApplicationsQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/applications" });
  let items;
  try {
    items = await applicationQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="applications" />;
  }
  if (!items.length) return <EmptyState title="No applications waiting" />;
  return (
    <ul className="space-y-4">
      {items.map((a) => (
        <li key={a.id}>
          <Card className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MemberLink member={a.applicant} subtitle={`${titleCase(a.planId)} · ${formatDate(a.createdAt)}`} />
              <StatusBadge status={a.status} />
            </div>
            {a.statement ? <p className="text-sm whitespace-pre-line">{a.statement}</p> : null}
            <ReviewActions
              endpoint={`/api/v1/admin/applications/${a.id}`}
              options={[
                { label: "Approve", body: { status: "approved" } },
                ...(a.status === "submitted" ? [{ label: "Mark under review", body: { status: "under_review" }, variant: "outline" as const }] : []),
                { label: "Reject", body: { status: "rejected" }, variant: "danger", requireNote: true },
              ]}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
