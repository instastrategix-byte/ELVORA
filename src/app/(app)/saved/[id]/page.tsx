import { ArrowLeft, FolderOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionManageButtons, RemoveFromCollectionButton } from "@/components/collections/collection-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostCard } from "@/components/feed/post-card";
import { ListingCard } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { getCollection } from "@backend/modules/collections/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Collection", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { viewer, db } = await requirePageSession({ next: `/saved/${id}` });
  const result = await attempt(() => getCollection(db, viewer, id));
  if (!result.ok) return <ServiceNotice error={result.error} what="this collection" />;
  // RLS returns nothing for collections that aren't the viewer's, so others' ids look like 404s.
  if (!result.data) notFound();
  const c = result.data;
  const empty = c.posts.length === 0 && c.listings.length === 0;

  return (
    <div>
      <Link href="/saved" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Saved
      </Link>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Private collection</p>
          <h1 className="display mt-2 text-4xl">{c.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {c.posts.length} {c.posts.length === 1 ? "post" : "posts"} · {c.listings.length} {c.listings.length === 1 ? "listing" : "listings"}
          </p>
        </div>
        <CollectionManageButtons id={c.id} name={c.name} />
      </div>

      {c.unavailableCount > 0 ? (
        <Alert tone="info" className="mb-6">
          {c.unavailableCount} saved {c.unavailableCount === 1 ? "item is" : "items are"} no longer available — removed by the author or no longer visible to you.
        </Alert>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<FolderOpen />}
          title="This collection is empty"
          description="Save a post or listing, then choose “Add to collection” to file it here."
          action={
            <Button asChild variant="outline">
              <Link href="/luxury">Explore the marketplace</Link>
            </Button>
          }
        />
      ) : null}

      {c.listings.length > 0 ? (
        <section aria-labelledby="col-listings" className="mb-10">
          <h2 id="col-listings" className="mb-3 text-sm font-semibold tracking-wide">
            Listings
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {c.listings.map((l) => (
              <li key={l.id} className="space-y-2">
                <ListingCard listing={l} canSave />
                <RemoveFromCollectionButton collectionId={c.id} itemType="listing" itemId={l.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {c.posts.length > 0 ? (
        <section aria-labelledby="col-posts" className="max-w-2xl">
          <h2 id="col-posts" className="mb-3 text-sm font-semibold tracking-wide">
            Posts
          </h2>
          <ul className="space-y-5">
            {c.posts.map((p) => (
              <li key={p.id} className="space-y-2">
                <PostCard post={p} canInteract />
                <RemoveFromCollectionButton collectionId={c.id} itemType="post" itemId={p.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
