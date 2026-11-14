import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Plan } from "@backend/modules/membership/types";

export const FEATURE_LABELS: Record<string, string> = {
  "feed.post": "Share posts, images and video",
  "connections.request": "Send connection requests",
  "messages.send": "Private messaging",
  "discover.members": "Discover members",
  "discover.advanced": "Advanced discovery filters",
  "luxury.view_members": "Members-only luxury listings",
  "luxury.inquire": "Direct inquiries to verified providers",
  "business.manage": "Business profile & inquiry inbox",
  "listings.publish": "Publish luxury listings",
  "ads.manage": "Sponsored campaigns & reporting",
};

export function PlanCard({ plan, footer, highlight }: { plan: Plan; footer?: ReactNode; highlight?: boolean }) {
  const monthly = plan.prices.filter((p) => p.interval === "month");
  const shown = monthly[0] ?? plan.prices[0];
  return (
    <Card id={plan.audience} className={cn("flex h-full flex-col p-6 sm:p-7", highlight && "border-accent/60")}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="display text-3xl">{plan.name}</h3>
        {plan.requiresApplication ? <Badge tone="accent">By application</Badge> : <Badge>Open</Badge>}
      </div>
      {plan.tagline ? <p className="mt-2 text-sm text-muted">{plan.tagline}</p> : null}
      <p className="mt-6">
        {plan.isFree ? (
          <span className="display text-4xl">Included</span>
        ) : shown ? (
          <>
            <span className="display text-4xl">{formatMoney(shown.amountMinor, shown.currency)}</span>
            <span className="text-sm text-muted"> / {shown.interval}</span>
          </>
        ) : (
          <span className="text-sm text-muted">Pricing shared on approval</span>
        )}
      </p>
      {plan.prices.length > 1 ? (
        <p className="mt-1 text-xs text-muted">
          Also available:{" "}
          {plan.prices
            .filter((p) => p !== shown)
            .map((p) => `${formatMoney(p.amountMinor, p.currency)}/${p.interval}`)
            .join(" · ")}
        </p>
      ) : null}
      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            {FEATURE_LABELS[f] ?? f}
          </li>
        ))}
      </ul>
      {plan.requiredVerifications.length ? (
        <p className="mt-4 text-xs text-muted">
          Requires approved {plan.requiredVerifications.map((v) => v.replace("_", " ")).join(" or ")} verification.
        </p>
      ) : null}
      {footer ? <div className="mt-6">{footer}</div> : null}
    </Card>
  );
}
