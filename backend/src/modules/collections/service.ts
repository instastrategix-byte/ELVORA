import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getPostsByIds } from "@backend/modules/feed/service";
import type { PostView } from "@backend/modules/feed/types";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import { getListingCardsByIds } from "@backend/modules/listings/service";
import type { ListingCard } from "@backend/modules/listings/types";

/*
 * Private collections of saved posts and listings. Ownership, privacy, visibility of items and
 * the caps (50 collections, 500 items each) are enforced by RLS and triggers (migration
 * 20261119000200); this module shapes data for the UI.
 */

export const ITEM_TYPES = ["post", "listing"] as const;
export type CollectionItemType = (typeof ITEM_TYPES)[number];

export const collectionNameSchema = z.object({
  name: z.string().trim().min(1, { error: "Give the collection a name" }).max(60, { error: "Names are limited to 60 characters" }),
});
export const collectionItemSchema = z.object({ itemType: z.enum(ITEM_TYPES), itemId: z.uuid() });
export const collectionListQuerySchema = z.object({ itemType: z.enum(ITEM_TYPES).optional(), itemId: z.uuid().optional() });

export type CollectionSummary = {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
  /** Present when the list was requested for a specific item: whether this collection holds it. */
  containsItem?: boolean;
};

export type CollectionDetail = {
  id: string;
  name: string;
  posts: PostView[];
  listings: ListingCard[];
  /** Saved items that are no longer visible (deleted, made private, or unpublished). */
  unavailableCount: number;
};

export async function listCollections(db: DbClient, viewer: Viewer, item?: { itemType: CollectionItemType; itemId: string }): Promise<CollectionSummary[]> {
  const rows = unwrap(
    await db.from("collections").select("id, name, updated_at, collection_items(count)").eq("owner_id", viewer.id).order("updated_at", { ascending: false }),
  ) as unknown as { id: string; name: string; updated_at: string; collection_items: { count: number }[] }[];
  let containing = new Set<string>();
  if (item && rows.length > 0) {
    const hits = unwrap(
      await db
        .from("collection_items")
        .select("collection_id")
        .eq("item_type", item.itemType)
        .eq("item_id", item.itemId)
        .in("collection_id", rows.map((r) => r.id)),
    );
    containing = new Set(hits.map((h) => h.collection_id));
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    itemCount: r.collection_items?.[0]?.count ?? 0,
    updatedAt: r.updated_at,
    ...(item ? { containsItem: containing.has(r.id) } : {}),
  }));
}

export async function createCollection(db: DbClient, input: z.infer<typeof collectionNameSchema>): Promise<CollectionSummary> {
  const row = unwrap(await db.from("collections").insert({ name: input.name }).select("id, name, updated_at").single());
  return { id: row.id, name: row.name, itemCount: 0, updatedAt: row.updated_at };
}

export async function renameCollection(db: DbClient, id: string, input: z.infer<typeof collectionNameSchema>) {
  const rows = unwrap(await db.from("collections").update({ name: input.name }).eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Collection not found.");
}

export async function deleteCollection(db: DbClient, id: string) {
  const rows = unwrap(await db.from("collections").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Collection not found.");
}

export async function addToCollection(db: DbClient, id: string, input: z.infer<typeof collectionItemSchema>) {
  const { error } = await db.from("collection_items").insert({ collection_id: id, item_type: input.itemType, item_id: input.itemId });
  // Already in the collection: adding again is a no-op, not an error.
  if (error && error.code === "23505") return;
  throwIfError(error);
}

export async function removeFromCollection(db: DbClient, id: string, input: z.infer<typeof collectionItemSchema>) {
  unwrap(await db.from("collection_items").delete().eq("collection_id", id).eq("item_type", input.itemType).eq("item_id", input.itemId).select("item_id"));
}

export async function getCollection(db: DbClient, viewer: Viewer, id: string): Promise<CollectionDetail | null> {
  const collection = unwrap(await db.from("collections").select("id, name").eq("id", id).maybeSingle());
  if (!collection) return null;
  const items = unwrap(
    await db.from("collection_items").select("item_type, item_id").eq("collection_id", id).order("added_at", { ascending: false }).limit(200),
  );
  const postIds = items.filter((i) => i.item_type === "post").map((i) => i.item_id);
  const listingIds = items.filter((i) => i.item_type === "listing").map((i) => i.item_id);
  const [posts, listings] = await Promise.all([getPostsByIds(db, viewer, postIds), getListingCardsByIds(db, viewer, listingIds)]);
  return {
    id: collection.id,
    name: collection.name,
    posts,
    listings,
    unavailableCount: postIds.length - posts.length + (listingIds.length - listings.length),
  };
}
