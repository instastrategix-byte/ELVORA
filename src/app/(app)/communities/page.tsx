import { Plus, Search, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CommunityCard } from "@/components/communities/community-card";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { hasFeature } from "@backend/modules/auth/permissions";
import { COMMUNITY_CATEGORIES } from "@backend/modules/communities/schemas";
import { listCommunities } from "@backend/modules/communities/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Communities" };

type Filter = "all" | "joined";

export default async function CommunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/communities" });
  const sp = await searchParams;
  const filter: Filter = sp.filter === "joined" ? "joined" : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const category = COMMUNITY_CATEGORIES.find((c) => c === sp.category);
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;
  const canCreate = hasFeature(viewer, "feed.post");
  const result = await attempt(() => listCommunities(db, viewer, { filter, q: q || undefined, category, cursor }));

  const href = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { filter: filter === "all" ? undefined : filter, q: q || undefined, category, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/communities?${s}` : "/communities";
  };

  return (
    <div>
      <PageHeader
        eyebrow="Circles"
        title="Communities"
        description="Member-run circles for founders, investors and enthusiasts to share knowledge in private."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/communities/new">
                <Plus aria-hidden="true" /> Create a community
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Community lists" className="flex w-fit rounded-full border border-border p-1 text-sm">
          {(["all", "joined"] as const).map((f) => (
            <Link
              key={f}
              href={href({ filter: f === "all" ? undefined : f, cursor: undefined })}
              aria-current={filter === f ? "page" : undefined}
              className={cn("rounded-full px-4 py-1.5 transition-colors", filter === f ? "bg-fg text-bg" : "text-muted hover:text-fg")}
            >
              {f === "all" ? "Discover" : "My communities"}
            </Link>
          ))}
        </nav>
        <form action="/communities" role="search" className="flex gap-2">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label htmlFor="community-q" className="sr-only">
            Search communities
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="community-q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={80}
              placeholder="Search communities"
              className="h-10 w-full rounded-full border border-border bg-surface pr-4 pl-9 text-sm focus:border-accent focus:outline-none sm:w-60"
            />
          </div>
          <label htmlFor="community-cat" className="sr-only">
            Category
          </label>
          <select
            id="community-cat"
            name="category"
            defaultValue={category ?? ""}
            className="h-10 rounded-full border border-border bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">All topics</option>
            {COMMUNITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="md">
            Search
          </Button>
        </form>
      </div>

      {!result.ok ? (
        <ServiceNotice error={result.error} what="communities" />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<UsersRound />}
          title={q || category ? "No communities match" : filter === "joined" ? "You haven't joined a community yet" : "No communities yet"}
          description={
            q || category
              ? "Try a different search or topic."
              : filter === "joined"
                ? "Join a community to see it here."
                : "Be the first to start a circle around what you know best."
          }
          action={
            filter === "joined" && !q ? (
              <Button asChild variant="outline">
                <Link href="/communities">Discover communities</Link>
              </Button>
            ) : canCreate && !q && !category ? (
              <Button asChild>
                <Link href="/communities/new">Create a community</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.data.items.map((c) => (
              <li key={c.id}>
                <CommunityCard community={c} />
              </li>
            ))}
          </ul>
          {result.data.nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Button asChild variant="outline">
                <Link href={href({ cursor: result.data.nextCursor })}>More communities</Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
