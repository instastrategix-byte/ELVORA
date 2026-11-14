import { FileText } from "lucide-react";
import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Alert, Card, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { VERIFICATION_LABELS, type VerificationKind } from "@backend/modules/auth/permissions";
import { verificationQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function VerificationsQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/verifications" });
  let items;
  try {
    items = await verificationQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="verification requests" />;
  }
  return (
    <div className="space-y-4">
      <Alert tone="info">Document links expire after 10 minutes. Do not download or share documents outside this review.</Alert>
      {!items.length ? <EmptyState title="No verification requests waiting" /> : null}
      <ul className="space-y-4">
        {items.map((v) => (
          <li key={v.id}>
            <Card className="space-y-4 p-6">
              <MemberLink member={v.subject} subtitle={`${VERIFICATION_LABELS[v.kind as VerificationKind]} · ${formatDate(v.createdAt)}`} />
              {v.statement ? <p className="text-sm whitespace-pre-line">{v.statement}</p> : null}
              <ul className="flex flex-wrap gap-2">
                {v.documents.map((d, i) => (
                  <li key={d.path}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent">
                        <FileText className="size-4" aria-hidden="true" /> Document {i + 1}
                      </a>
                    ) : (
                      <span className="text-sm text-muted">Document {i + 1} unavailable</span>
                    )}
                  </li>
                ))}
              </ul>
              <ReviewActions
                endpoint={`/api/v1/admin/verifications/${v.id}`}
                options={[
                  { label: "Approve badge", body: { status: "approved" } },
                  { label: "Reject", body: { status: "rejected" }, variant: "danger", requireNote: true },
                ]}
              />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
