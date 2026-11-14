import { ReviewActions } from "@/components/admin/review-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDate, formatMoney, titleCase } from "@/lib/format";
import { campaignQueue } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function CampaignsQueue() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/campaigns" });
  let items;
  try {
    items = await campaignQueue(db);
  } catch (error) {
    return <ServiceNotice error={error} what="campaign reviews" />;
  }
  if (!items.length) return <EmptyState title="No campaigns waiting for review" />;
  return (
    <ul className="space-y-4">
      {items.map((c) => (
        <li key={c.id}>
          <Card className="space-y-4 p-6">
            <MemberLink member={c.owner} subtitle={`${c.name} · ${titleCase(c.objective)}`} />
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted">Sponsored preview</p>
              <p className="display mt-1 text-xl">{c.headline}</p>
              {c.body ? <p className="text-sm text-muted">{c.body}</p> : null}
              {c.destinationUrl ? <p className="mt-1 text-xs break-all text-accent">{c.destinationUrl}</p> : null}
            </div>
            <p className="text-sm text-muted">
              {formatDate(c.startsOn)} – {formatDate(c.endsOn)} · {formatMoney(c.dailyBudgetMinor, c.currency)}/day ·{" "}
              {formatMoney(c.totalBudgetMinor, c.currency)} total
              {c.targetLocations.length ? ` · ${c.targetLocations.join(", ")}` : ""}
              {c.targetInterests.length ? ` · ${c.targetInterests.join(", ")}` : ""}
            </p>
            <ReviewActions
              endpoint={`/api/v1/admin/campaigns/${c.id}`}
              options={[
                { label: "Approve", body: { action: "approve" } },
                { label: "Reject", body: { action: "reject" }, variant: "danger", requireNote: true },
              ]}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
