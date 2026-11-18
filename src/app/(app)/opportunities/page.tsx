import { Briefcase, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { hasFeature } from "@backend/modules/auth/permissions";
import { OPPORTUNITY_KIND_LABELS, OPPORTUNITY_KINDS, opportunityListSchema } from "@backend/modules/opportunities/schemas";
import { listOpportunities } from "@backend/modules/opportunities/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Opportunities", robots: { index: false } };

const TABS = [
  { key: "browse", label: "Browse" },
  { key: "mine", label: "My posts" },
  { key: "interested", label: "My interests" },
] as const;

const EMPTY = {
  browse: { title: "No open opportunities match", description: "Raises, partnerships, roles and board seats posted by members appear here. Try clearing the filters, or post your own." },
  mine: { title: "You haven't posted anything yet", description: "Share a raise, a role, a partnership or a board seat. Interested members respond privately — only you see who." },
  interested: { title: "No responses yet", description: "Opportunities you express interest in will appear here, with the poster's decision." },
} as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/opportunities" });
  const sp = await searchParams;
  const parsed = opportunityListSchema.safeParse({
    tab: typeof sp.tab === "string" ? sp.tab : undefined,
    kind: typeof sp.kind === "string" && sp.kind ? sp.kind : undefined,
    industry: typeof sp.industry === "string" && sp.industry ? sp.industry : undefined,
    q: typeof sp.q === "string" && sp.q ? sp.q : undefined,
    cursor: typeof sp.cursor === "string" ? sp.cursor : undefined,
  });
  const query = parsed.success ? parsed.data : { tab: "browse" as const };
  const result = await attempt(() => listOpportunities(db, viewer, query));
  const canPost = hasFeature(viewer, "feed.post");
  const filtered = Boolean(query.kind || query.industry || query.q);
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: query.tab === "browse" ? undefined : query.tab, kind: query.kind, industry: query.industry, q: query.q, ...extra })) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `/opportunities?${s}` : "/opportunities";
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Private deal flow"
        title="Opportunities"
        description="Raises, partnerships, roles, advisory and board seats shared by members. Responses are private between you and the poster."
        actions={
          canPost ? (
            <Button asChild>
              <Link href="/opportunities/new">
                <Plus /> Post an opportunity
              </Link>
            </Button>
          ) : undefined
        }
      />

      <nav aria-label="Opportunity lists" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "browse" ? "/opportunities" : `/opportunities?tab=${t.key}`}
            aria-current={query.tab === t.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              query.tab === t.key ? "border-fg bg-fg text-bg" : "border-border text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form action="/opportunities" role="search" className="mb-6 grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]">
        {query.tab !== "browse" ? <input type="hidden" name="tab" value={query.tab} /> : null}
        <label className="sr-only" htmlFor="opp-q">
          Search opportunities
        </label>
        <Input id="opp-q" name="q" defaultValue={query.q ?? ""} placeholder="Search titles and summaries" maxLength={80} />
        <label className="sr-only" htmlFor="opp-kind">
          Type
        </label>
        <Select id="opp-kind" name="kind" defaultValue={query.kind ?? ""}>
          <option value="">All types</option>
          {OPPORTUNITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {OPPORTUNITY_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="opp-industry">
          Industry
        </label>
        <Input id="opp-industry" name="industry" defaultValue={query.industry ?? ""} placeholder="Industry" maxLength={60} />
        <Button type="submit" variant="secondary">
          <Search /> Filter
        </Button>
      </form>

      {!result.ok ? (
        <ServiceNotice error={result.error} what="opportunities" />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title={EMPTY[query.tab].title}
          description={filtered ? "Nothing matches these filters. Try a broader search." : EMPTY[query.tab].description}
          action={
            filtered ? (
              <Button asChild variant="outline">
                <Link href={keep({ kind: undefined, industry: undefined, q: undefined })}>Clear filters</Link>
              </Button>
            ) : query.tab !== "interested" && canPost ? (
              <Button asChild>
                <Link href="/opportunities/new">Post an opportunity</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {result.data.items.map((o) => (
              <li key={o.id}>
                <OpportunityCard opportunity={o} />
              </li>
            ))}
          </ul>
          {result.data.nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Button asChild variant="outline">
                <Link href={keep({ cursor: result.data.nextCursor })}>Older opportunities</Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
