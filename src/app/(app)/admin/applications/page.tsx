import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { MemberLink } from "@/components/social/member-card";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { titleCase } from "@/lib/format";
import { RELATIONSHIP_LABELS } from "@backend/modules/vouches/constants";
import { applicationQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";
import { LocalTime } from "@/components/ui/local-time";

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
              <MemberLink member={a.applicant} subtitle={<>{titleCase(a.planId)} · <LocalTime iso={a.createdAt} format="date" /></>} />
              <StatusBadge status={a.status} />
            </div>
            {a.statement ? <p className="text-sm whitespace-pre-line">{a.statement}</p> : null}
            {a.trust && (a.trust.referees.length || a.trust.vouches.length) ? (
              <div className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Referees named</h3>
                  {a.trust.referees.length ? (
                    <ul className="space-y-2">
                      {a.trust.referees.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2">
                          <MemberLink member={r.person} size={28} subtitle={<LocalTime iso={r.createdAt} format="date" />} />
                          <Badge tone={r.status === "accepted" ? "success" : r.status === "declined" ? "danger" : "neutral"}>
                            {r.status === "accepted" ? "Vouched" : r.status === "declined" ? "Declined" : titleCase(r.status)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None</p>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Vouched for by ({a.trust.vouches.length})</h3>
                  {a.trust.vouches.length ? (
                    <ul className="space-y-2">
                      {a.trust.vouches.map((v) => (
                        <li key={v.id} className="space-y-1">
                          <MemberLink member={v.voucher} size={28} subtitle={RELATIONSHIP_LABELS[v.relationship]} />
                          {v.note ? <p className="pl-9 text-xs text-muted">“{v.note}”</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">None yet</p>
                  )}
                </div>
                <p className="text-xs text-muted sm:col-span-2">
                  Referee answers are shown to staff only; the applicant sees declines as pending. Vouches inform your decision but don&apos;t change approval rules.
                </p>
              </div>
            ) : null}
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
