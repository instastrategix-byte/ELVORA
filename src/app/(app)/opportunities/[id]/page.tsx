import { ArrowLeft, Clock, Lock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { InterestControls, InterestList, PosterControls } from "@/components/opportunities/opportunity-actions";
import { formatAmountRange, OpportunityStatusBadge } from "@/components/opportunities/opportunity-card";
import { MemberLink } from "@/components/social/member-card";
import { Badge } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { OPPORTUNITY_KIND_LABELS } from "@backend/modules/opportunities/schemas";
import { getOpportunity, listInterests } from "@backend/modules/opportunities/service";
import { requirePageSession } from "@backend/auth/viewer";
import { LocalTime } from "@/components/ui/local-time";

export const metadata: Metadata = { title: "Opportunity", robots: { index: false } };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/opportunities/${id}` });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await attempt(() => getOpportunity(db, viewer, id));
  if (!result.ok) return <ServiceNotice error={result.error} what="this opportunity" />;
  const o = result.data;
  if (!o) notFound();
  const interests = o.isAuthor ? await attempt(() => listInterests(db, viewer, o.id)) : null;
  const amount = formatAmountRange(o);
  const live = o.status === "open" && !o.expired;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0 space-y-6">
        <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden="true" /> Opportunities
        </Link>
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{OPPORTUNITY_KIND_LABELS[o.kind]}</Badge>
            <OpportunityStatusBadge opportunity={o} />
            {o.visibility === "connections" ? (
              <Badge>
                <Lock className="size-3" aria-hidden="true" /> Connections only
              </Badge>
            ) : null}
          </div>
          <h1 className="display text-4xl leading-tight sm:text-5xl">{o.title}</h1>
          {o.summary ? <p className="text-lg text-muted">{o.summary}</p> : null}
        </header>

        <dl className="panel grid gap-4 p-5 sm:grid-cols-2">
          {amount ? (
            <div>
              <dt className="text-xs text-muted">Amount</dt>
              <dd className="mt-1 font-semibold">{amount}</dd>
            </div>
          ) : null}
          {o.industry ? (
            <div>
              <dt className="text-xs text-muted">Industry</dt>
              <dd className="mt-1">{o.industry}</dd>
            </div>
          ) : null}
          {o.location || o.remote ? (
            <div>
              <dt className="text-xs text-muted">Location</dt>
              <dd className="mt-1 flex items-center gap-1">
                <MapPin className="size-3.5 text-muted" aria-hidden="true" />
                {[o.location, o.remote ? "Remote" : null].filter(Boolean).join(" · ")}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted">{live ? "Open until" : "Closes"}</dt>
            <dd className="mt-1 flex items-center gap-1">
              <Clock className="size-3.5 text-muted" aria-hidden="true" /> <LocalTime iso={o.expiresAt} format="date" />
            </dd>
          </div>
        </dl>

        {o.details ? (
          <section aria-label="Details" className="text-[15px] leading-7 whitespace-pre-line">
            {o.details}
          </section>
        ) : null}

        {o.isAuthor ? (
          <Widget title={`Interested members${interests?.ok ? ` (${interests.data.filter((i) => i.status !== "withdrawn").length})` : ""}`}>
            {!interests || !interests.ok ? <WidgetError what="responses" /> : <InterestList opportunityId={o.id} interests={interests.data} />}
          </Widget>
        ) : null}
      </article>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <section className="panel space-y-4 p-5" aria-label="Posted by">
          <p className="text-xs text-muted">Posted {formatRelative(o.createdAt)} by</p>
          <MemberLink member={o.author} size={44} subtitle={o.author.headline ?? undefined} />
        </section>
        <section className="panel space-y-3 p-5" aria-label={o.isAuthor ? "Manage" : "Respond"}>
          {o.isAuthor ? (
            <>
              <p className="text-sm text-muted">Only you can see who has responded.</p>
              <PosterControls opportunityId={o.id} status={o.status} />
            </>
          ) : (
            <InterestControls opportunityId={o.id} myInterest={o.myInterest} myNote={o.myNote} canRespond={live} />
          )}
        </section>
      </aside>
    </div>
  );
}
