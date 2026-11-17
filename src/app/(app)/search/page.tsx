import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { ListingCard } from "@/components/listings/listing-card";
import { MemberCard, MemberLink } from "@/components/social/member-card";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listFeed } from "@backend/modules/feed/service";
import { browseListings, searchBusinesses } from "@backend/modules/listings/service";
import { searchMembers } from "@backend/modules/profiles/service";
import { requirePageSession } from "@backend/auth/viewer";
import { searchEventsSection } from "./events-results";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

const TYPES = [
  { key: "all", label: "All" },
  { key: "people", label: "People" },
  { key: "posts", label: "Posts" },
  { key: "listings", label: "Listings" },
  { key: "businesses", label: "Businesses" },
  { key: "events", label: "Events" },
] as const;
type SearchType = (typeof TYPES)[number]["key"];

/**
 * One search box across people, posts, listings, businesses and events. Every source is queried
 * as the signed-in member, so RLS decides what each person may find.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/search" });
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const type: SearchType = TYPES.some((t) => t.key === sp.type) ? (sp.type as SearchType) : "all";
  const want = (t: SearchType) => q.length >= 2 && (type === "all" || type === t);
  const limit = type === "all" ? 6 : 24;

  const [people, posts, listings, businesses, events] = await Promise.all([
    want("people") ? attempt(() => searchMembers(db, viewer, { q })) : null,
    want("posts") ? attempt(() => listFeed(db, viewer, { scope: "all", q })) : null,
    want("listings") ? attempt(() => browseListings(db, viewer, { q })) : null,
    want("businesses") ? attempt(() => searchBusinesses(db, q)) : null,
    want("events") ? searchEventsSection(db, viewer, q, limit) : null,
  ]);

  const total =
    (people?.ok ? people.data.items.length : 0) +
    (posts?.ok ? posts.data.items.length : 0) +
    (listings?.ok ? listings.data.items.length : 0) +
    (businesses?.ok ? businesses.data.length : 0) +
    (events?.count ?? 0);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className="display text-4xl">Search</h1>
        <form action="/search" role="search" className="relative max-w-2xl">
          <label htmlFor="search-page-q" className="sr-only">
            Search ELVORA
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="search-page-q"
            name="q"
            type="search"
            defaultValue={q}
            minLength={2}
            maxLength={80}
            autoFocus={!q}
            placeholder="Names, companies, topics, places…"
            className="h-12 w-full rounded-xl border border-border-strong bg-surface pr-4 pl-12 text-base focus:border-accent focus:outline-none"
          />
          {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        </form>
        <nav aria-label="Result types" className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Link
              key={t.key}
              href={`/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(t.key === "all" ? {} : { type: t.key }) })}`}
              aria-current={type === t.key ? "page" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                type === t.key ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {q.length < 2 ? (
        <EmptyState icon={<Search />} title="Search the network" description="Type at least two characters to search members, posts, listings, businesses and events." />
      ) : total === 0 && [people, posts, listings, businesses].every((r) => r === null || r.ok) && !events?.failed ? (
        <EmptyState icon={<Search />} title={`No results for “${q}”`} description="Try a different spelling, a company name, or a broader term." />
      ) : (
        <div className="space-y-6">
          {people && (!people.ok || people.data.items.length > 0) ? (
            <Widget title="People" href={type === "all" ? `/search?q=${encodeURIComponent(q)}&type=people` : undefined} hrefLabel="All people">
              {!people.ok ? (
                <WidgetError what="members" />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {people.data.items.slice(0, limit).map((m) => (
                    <li key={m.id}>
                      <MemberCard member={m} />
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          ) : null}

          {posts && (!posts.ok || posts.data.items.length > 0) ? (
            <Widget title="Posts" href={type === "all" ? `/search?q=${encodeURIComponent(q)}&type=posts` : undefined} hrefLabel="All posts">
              {!posts.ok ? (
                <WidgetError what="posts" />
              ) : (
                <ul className="divide-y divide-border">
                  {posts.data.items.slice(0, limit).map((p) => (
                    <li key={p.id} className="py-4 first:pt-0 last:pb-0">
                      <MemberLink member={p.author} size={32} subtitle={formatRelative(p.createdAt)} />
                      <Link href={`/posts/${p.id}`} className="mt-2 block line-clamp-3 text-sm leading-6 hover:text-accent">
                        {p.body}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          ) : null}

          {events?.node}

          {listings && (!listings.ok || listings.data.items.length > 0) ? (
            <Widget title="Listings" href={type === "all" ? `/search?q=${encodeURIComponent(q)}&type=listings` : undefined} hrefLabel="All listings">
              {!listings.ok ? (
                <WidgetError what="listings" />
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {listings.data.items.slice(0, limit).map((l) => (
                    <li key={l.id}>
                      <ListingCard listing={l} canSave={hasFeature(viewer, "luxury.view_members")} />
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          ) : null}

          {businesses && (!businesses.ok || businesses.data.length > 0) ? (
            <Widget title="Businesses">
              {!businesses.ok ? (
                <WidgetError what="businesses" />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {businesses.data.slice(0, limit).map((b) => (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl border border-border p-4">
                      <Building2 className="size-5 shrink-0 text-accent" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium">
                          {b.name} {b.verified ? <Badge tone="accent">Verified business</Badge> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {titleCase(b.category)}
                          {b.location ? ` · ${b.location}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Widget>
          ) : null}
        </div>
      )}
    </div>
  );
}
