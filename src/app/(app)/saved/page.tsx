import { Bookmark, Folder } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewCollectionButton } from "@/components/collections/collection-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostList } from "@/components/feed/post-list";
import { ListingCard } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Viewer } from "@backend/modules/auth/permissions";
import { listCollections } from "@backend/modules/collections/service";
import { listSavedPosts } from "@backend/modules/feed/service";
import { listSavedListings } from "@backend/modules/listings/service";
import type { DbClient } from "@backend/db/server";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/saved" });
  const tab = (await searchParams).tab === "listings" ? "listings" : "posts";

  return (
    <div>
      <PageHeader title="Saved" description="Only you can see what you've saved. Organise it into private collections." actions={<NewCollectionButton />} />

      <section aria-labelledby="collections-h" className="mb-10">
        <h2 id="collections-h" className="mb-3 text-sm font-semibold tracking-wide">
          Collections
        </h2>
        <Suspense
          fallback={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading collections">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          }
        >
          <Collections db={db} viewer={viewer} />
        </Suspense>
      </section>

      <h2 className="mb-3 text-sm font-semibold tracking-wide">All saved</h2>
      <div role="tablist" aria-label="Saved items" className="mb-6 flex gap-2">
        {(["posts", "listings"] as const).map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={tab === t}
            href={t === "posts" ? "/saved" : "/saved?tab=listings"}
            className={cn("rounded-full border px-4 py-2 text-sm", tab === t ? "border-accent bg-accent text-accent-fg" : "border-border text-muted hover:text-fg")}
          >
            {t === "posts" ? "Posts" : "Listings"}
          </Link>
        ))}
      </div>
      {tab === "posts" ? <SavedPosts db={db} viewer={viewer} /> : <SavedListings db={db} viewer={viewer} />}
    </div>
  );
}

async function Collections({ db, viewer }: { db: DbClient; viewer: Viewer }) {
  const result = await attempt(() => listCollections(db, viewer));
  if (!result.ok) return <ServiceNotice error={result.error} what="your collections" />;
  if (result.data.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted">
        No collections yet. Group saved posts and listings — say, “Monaco 2027” or “Investors to follow” — with <strong>New collection</strong> or the
        “Add to collection” option on anything you&apos;ve saved.
      </p>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {result.data.map((c) => (
        <li key={c.id}>
          <Link href={`/saved/${c.id}`} className="panel-interactive flex h-full flex-col p-4">
            <Folder className="mb-3 size-5 text-accent" aria-hidden="true" />
            <span className="truncate font-medium">{c.name}</span>
            <span className="mt-1 text-xs text-muted">
              {c.itemCount} {c.itemCount === 1 ? "item" : "items"} · updated {formatRelative(c.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function SavedPosts({ db, viewer }: { db: DbClient; viewer: Viewer }) {
  const result = await attempt(() => listSavedPosts(db, viewer));
  if (!result.ok) return <ServiceNotice error={result.error} what="your saved posts" />;
  return (
    <div className="max-w-2xl">
      <PostList initial={result.data} endpoint="/api/v1/saved/posts" canInteract emptyTitle="No saved posts" emptyDescription="Use the bookmark on any post to keep it here." />
    </div>
  );
}

async function SavedListings({ db, viewer }: { db: DbClient; viewer: Viewer }) {
  const result = await attempt(() => listSavedListings(db, viewer));
  if (!result.ok) return <ServiceNotice error={result.error} what="your saved listings" />;
  if (!result.data.length) {
    return (
      <EmptyState
        icon={<Bookmark />}
        title="No saved listings"
        description="Save villas, yachts and experiences to compare later."
        action={
          <Button asChild variant="outline">
            <Link href="/luxury">Explore the marketplace</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {result.data.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} canSave />
        </li>
      ))}
    </ul>
  );
}
