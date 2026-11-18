import { Clock, Lock, MapPin, Wifi } from "lucide-react";
import Link from "next/link";
import { MemberLink } from "@/components/social/member-card";
import { Badge } from "@/components/ui/primitives";
import { formatDate, formatMoney, formatRelative, toMinorUnits } from "@/lib/format";
import { INTEREST_STATUS_LABELS, OPPORTUNITY_KIND_LABELS } from "@backend/modules/opportunities/schemas";
import type { OpportunityCard as Card } from "@backend/modules/opportunities/types";

/** "$500K – $2M", "From $1M", "Up to $250K", or null. */
export function formatAmountRange(o: Pick<Card, "amountMinMinor" | "amountMaxMinor" | "currency">): string | null {
  if (!o.currency || (o.amountMinMinor == null && o.amountMaxMinor == null)) return null;
  const f = (v: number) => {
    try {
      // Minor units → major units (respecting zero-decimal currencies), shown compactly: $2.5M.
      const major = v / toMinorUnits(1, o.currency!);
      return new Intl.NumberFormat("en", { style: "currency", currency: o.currency!, notation: "compact", maximumFractionDigits: 1 }).format(major);
    } catch {
      return formatMoney(v, o.currency!);
    }
  };
  if (o.amountMinMinor != null && o.amountMaxMinor != null) return o.amountMinMinor === o.amountMaxMinor ? f(o.amountMinMinor) : `${f(o.amountMinMinor)} – ${f(o.amountMaxMinor)}`;
  if (o.amountMinMinor != null) return `From ${f(o.amountMinMinor)}`;
  return `Up to ${f(o.amountMaxMinor!)}`;
}

export function OpportunityStatusBadge({ opportunity }: { opportunity: Pick<Card, "status" | "expired"> }) {
  if (opportunity.status === "closed") return <Badge>Closed</Badge>;
  if (opportunity.expired) return <Badge tone="warning">Expired</Badge>;
  return <Badge tone="success">Open</Badge>;
}

export function OpportunityCard({ opportunity: o }: { opportunity: Card }) {
  const amount = formatAmountRange(o);
  const place = o.remote ? (o.location ? `${o.location} · Remote` : "Remote") : o.location;
  return (
    <article className="panel-interactive relative space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{OPPORTUNITY_KIND_LABELS[o.kind]}</Badge>
        {o.visibility === "connections" ? (
          <Badge>
            <Lock className="size-3" aria-hidden="true" /> Connections
          </Badge>
        ) : null}
        {o.status !== "open" || o.expired ? <OpportunityStatusBadge opportunity={o} /> : null}
        {o.myInterest && o.myInterest !== "withdrawn" ? <Badge tone={o.myInterest === "declined" ? "neutral" : "success"}>{INTEREST_STATUS_LABELS[o.myInterest]}</Badge> : null}
        <span className="ml-auto text-xs text-muted">{formatRelative(o.createdAt)}</span>
      </div>
      <h3 className="text-lg leading-snug font-semibold">
        <Link href={`/opportunities/${o.id}`} className="after:absolute after:inset-0 hover:text-accent">
          {o.title}
        </Link>
      </h3>
      {o.summary ? <p className="line-clamp-2 text-sm text-muted">{o.summary}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {amount ? <span className="font-medium text-fg">{amount}</span> : null}
        {o.industry ? <span>{o.industry}</span> : null}
        {place ? (
          <span className="inline-flex items-center gap-1">
            {o.remote && !o.location ? <Wifi className="size-3" aria-hidden="true" /> : <MapPin className="size-3" aria-hidden="true" />} {place}
          </span>
        ) : null}
        {o.status === "open" && !o.expired ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" /> Until {formatDate(o.expiresAt)}
          </span>
        ) : null}
      </div>
      <div className="relative z-10 flex items-center justify-between gap-3 border-t border-border pt-3">
        <MemberLink member={o.author} size={30} subtitle={o.author.headline ?? undefined} />
        {o.isAuthor ? (
          <span className="shrink-0 text-xs text-muted">
            {o.interestCount} {o.interestCount === 1 ? "member" : "members"} interested
          </span>
        ) : null}
      </div>
    </article>
  );
}
