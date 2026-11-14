import Link from "next/link";
import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { formatDate, titleCase } from "@/lib/format";
import { reportQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function ReportsQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/reports" });
  let items;
  try {
    items = await reportQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="reports" />;
  }
  if (!items.length) return <EmptyState title="No open reports" />;
  return (
    <ul className="space-y-4">
      {items.map((r) => {
        const contentTarget = r.targetType === "post" || r.targetType === "comment" || r.targetType === "listing";
        const authorId = r.targetType === "profile" ? r.targetId : (r.post?.author_id ?? null);
        return (
          <li key={r.id}>
            <Card className="space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">{titleCase(r.reason)}</Badge>
                <Badge>{titleCase(r.targetType)}</Badge>
                <span className="text-xs text-muted">Reported {formatDate(r.createdAt)} by</span>
                <MemberLink member={r.reporter} size={24} />
              </div>
              {r.details ? <p className="text-sm whitespace-pre-line">{r.details}</p> : null}
              {r.post ? (
                <blockquote className="rounded-xl border border-border bg-surface-2 p-4 text-sm whitespace-pre-line">
                  {r.post.body || "(media only)"}
                  <Link href={`/posts/${r.targetId}`} className="mt-2 block text-xs text-accent hover:underline">
                    Open post
                  </Link>
                </blockquote>
              ) : null}
              <ReviewActions
                endpoint="/api/v1/admin/moderation"
                noteLabel="Reason (required; recorded in the audit log and sent to the member for enforcement actions)"
                options={[
                  ...(contentTarget
                    ? [
                        { label: "Hide content", body: { action: "hide_content", targetType: r.targetType, targetId: r.targetId, reportId: r.id }, requireNote: true },
                        { label: "Remove content", body: { action: "remove_content", targetType: r.targetType, targetId: r.targetId, reportId: r.id }, variant: "danger" as const, requireNote: true },
                      ]
                    : []),
                  ...(authorId
                    ? [
                        { label: "Warn member", body: { action: "warn", targetUserId: authorId, reportId: r.id }, variant: "outline" as const, requireNote: true },
                        { label: "Suspend member", body: { action: "suspend", targetUserId: authorId, reportId: r.id }, variant: "danger" as const, requireNote: true },
                      ]
                    : []),
                ]}
              />
              <ReviewActions endpoint={`/api/v1/admin/reports/${r.id}/dismiss`} noteLabel="Dismissal note (internal)" options={[{ label: "Dismiss report", body: {}, variant: "outline" }]} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
