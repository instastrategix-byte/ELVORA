import { Gift } from "lucide-react";
import { PlanGrantForm, RevokeGrantButton } from "@/components/admin/plan-grant-form";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate } from "@/lib/format";
import { listPlanGrants } from "@backend/modules/admin/service";
import { listPlans } from "@backend/modules/membership/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function PlanGrantsPage() {
  const { db } = await requirePageSession({ staff: "admin", next: "/admin/grants" });
  const result = await attempt(() => Promise.all([listPlans(db), listPlanGrants(db)]));
  if (!result.ok) return <ServiceNotice error={result.error} what="complimentary grants" />;
  const [plans, grants] = result.data;
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const grantable = plans.filter((p) => !p.isFree).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-8">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <h2 className="display text-2xl">Grant complimentary access</h2>
          <p className="text-sm text-muted">
            Gives a member a plan&apos;s features for a fixed period — for partners, press, testers or staff. It is not a payment or subscription, never
            grants a verification badge, and every grant is recorded in the audit log.
          </p>
        </div>
        <PlanGrantForm plans={grantable} />
      </Card>

      <section className="space-y-4" aria-labelledby="grants-heading">
        <h2 id="grants-heading" className="display text-2xl">
          Grants
        </h2>
        {grants.length === 0 ? (
          <EmptyState icon={<Gift />} title="No complimentary grants yet" description="Grants you create appear here with their expiry." />
        ) : (
          <ul className="space-y-3">
            {grants.map((g) => {
              const active = g.active;
              return (
                <li key={g.id}>
                  <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="space-y-2">
                      <MemberLink member={g.member} subtitle={`${planName.get(g.planId) ?? g.planId} · ${g.reason}`} />
                      <p className="text-xs text-muted">
                        Granted {formatDate(g.createdAt)}
                        {g.grantedBy ? ` by @${g.grantedBy.handle}` : ""} ·{" "}
                        {g.revokedAt ? `revoked ${formatDate(g.revokedAt)}` : `${active ? "ends" : "ended"} ${formatDate(g.expiresAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : g.revokedAt ? "Revoked" : "Expired"}</Badge>
                      {active ? <RevokeGrantButton id={g.id} /> : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
