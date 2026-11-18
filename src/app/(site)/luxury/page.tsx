import { Gem, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ListingGrid } from "@/components/listings/listing-grid";
import { SponsoredSlot } from "@/components/ads/sponsored-slot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, EmptyState, Skeleton } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { createClient } from "@backend/db/server";
import { hasFeature } from "@backend/modules/auth/permissions";
import { CATEGORY_LABELS, LISTING_CATEGORIES, listingBrowseSchema } from "@backend/modules/listings/schemas";
import { browseListings } from "@backend/modules/listings/service";
import { getSession } from "@backend/auth/viewer";

export const metadata: Metadata = {
  title: "Luxury marketplace",
  description: "Villas, residences, hotels, resorts, yachts, supercars, private aviation, events and experiences from verified providers.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LuxuryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-12 sm:py-16">
      <header className="space-y-3">
        <p className="eyebrow">Luxury marketplace</p>
        <h1 className="display text-5xl sm:text-6xl">The exceptional, verified.</h1>
        <p className="max-w-2xl text-muted">Every provider on ELVORA is reviewed. Members-only listings are visible to Premium members.</p>
      </header>
      <Suspense fallback={<GridSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="mt-10 space-y-6">
      <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = listingBrowseSchema.safeParse({
    category: typeof raw.category === "string" ? raw.category : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
    location: typeof raw.location === "string" ? raw.location : undefined,
  });
  const filters = parsed.success ? parsed.data : {};
  const query: Record<string, string> = {};
  if (filters.category) query.category = filters.category;
  if (filters.q) query.q = filters.q;
  if (filters.location) query.location = filters.location;

  const result = await attempt(async () => {
    const session = await getSession();
    const db = session?.db ?? (await createClient());
    return { session, page: await browseListings(db, session?.viewer ?? null, filters) };
  });
  const session = result.ok ? result.data.session : null;
  const viewerIsMember = Boolean(session?.viewer.onboarded && session.viewer.accountStatus === "active");
  const canSeeMembersOnly = hasFeature(session?.viewer ?? null, "luxury.view_members");
  const content = !result.ok ? (
    <ServiceNotice error={result.error} what="listings" />
  ) : result.data.page.items.length === 0 ? (
        <EmptyState
          icon={<Gem />}
          title="Nothing here yet"
          description={
            Object.keys(query).length
              ? "No listings match these filters. Try another category or location."
              : "Verified providers are preparing their listings. Check back soon."
          }
          action={
            Object.keys(query).length ? (
              <Button asChild variant="outline">
                <Link href="/luxury">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ListingGrid key={JSON.stringify(query)} initial={result.data.page} query={query} canSave={viewerIsMember} />
      );

  return (
    <div className="mt-10 space-y-8">
      <form method="get" className="flex flex-col gap-3 sm:flex-row" role="search" aria-label="Search listings">
        {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
        <label className="relative flex-1">
          <span className="sr-only">Search listings</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input name="q" defaultValue={filters.q} placeholder="Search villas, yachts, experiences…" className="pl-10" />
        </label>
        <label className="sm:w-56">
          <span className="sr-only">Location</span>
          <Input name="location" defaultValue={filters.location} placeholder="City or country" />
        </label>
        <Button type="submit">Search</Button>
      </form>

      <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <CategoryChip href={hrefWith(query, undefined)} active={!filters.category} label="All" />
        {LISTING_CATEGORIES.map((c) => (
          <CategoryChip key={c} href={hrefWith(query, c)} active={filters.category === c} label={CATEGORY_LABELS[c]} />
        ))}
      </nav>

      {!canSeeMembersOnly ? (
        <Alert tone="info" title="Some listings are reserved for Premium members">
          {viewerIsMember ? (
            <>
              Upgrade to Premium to view members-only listings and contact providers directly.{" "}
              <Link href="/account/membership" className="text-accent underline-offset-4 hover:underline">
                See membership options
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in?next=/luxury" className="text-accent underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              or{" "}
              <Link href="/apply" className="text-accent underline-offset-4 hover:underline">
                apply
              </Link>{" "}
              to see more.
            </>
          )}
        </Alert>
      ) : null}

      {viewerIsMember ? <SponsoredSlot placement="luxury" /> : null}
      {content}
    </div>
  );
}

function hrefWith(query: Record<string, string>, category: string | undefined) {
  const params = new URLSearchParams(query);
  if (category) params.set("category", category);
  else params.delete("category");
  const s = params.toString();
  return s ? `/luxury?${s}` : "/luxury";
}

function CategoryChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-4 py-2 text-sm transition-colors",
        active ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:border-accent hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}
