import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/format";
import { publicMediaUrl } from "@/lib/media";
import { decodeCursor, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import { slugify } from "@/lib/utils";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { assertOwnedPath } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type {
  businessSchema,
  inquirySchema,
  ListingBrowse,
  listingSchema,
  ListingCategory,
} from "./schemas";
import type { BusinessDetail, BusinessSummary, InquiryView, ListingCard, ListingDetail } from "./types";

const PAGE = 24;
const LISTING_COLUMNS =
  "id, business_id, title, slug, category, summary, description, city, country, price_from_minor, currency, price_unit, amenities, visibility, status, cover_path, approved_at, review_note, published_at, created_at";

/**
 * Columns any viewer may read. Verification details (registration number, evidence, reviewer
 * note) are column-restricted in the database and come only from business_private_details(),
 * which returns them to the owner and moderators.
 */
export const BUSINESS_PUBLIC_COLUMNS = "id, owner_id, name, slug, category, location, status, logo_path, description, website, contact_email";

type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string;
  location: string | null;
  status: BusinessDetail["status"];
  logo_path: string | null;
  description: string | null;
  website: string | null;
  contact_email: string | null;
  registration_number?: string | null;
  review_note?: string | null;
  evidence_paths?: string[];
};

export type BusinessPrivate = { registration_number: string | null; evidence_paths: string[]; review_note: string | null };

/** Verification details for the given businesses, for the owner or a moderator; others get nothing. */
export async function businessPrivateDetails(db: DbClient, ids: string[]): Promise<Map<string, BusinessPrivate>> {
  if (ids.length === 0) return new Map();
  const rows = unwrap(await db.rpc("business_private_details", { p_ids: ids }));
  return new Map(
    rows.map((r) => [r.id, { registration_number: r.registration_number, evidence_paths: r.evidence_paths ?? [], review_note: r.review_note }]),
  );
}

async function withPrivate(db: DbClient, row: BusinessRow): Promise<BusinessRow> {
  const extra = (await businessPrivateDetails(db, [row.id])).get(row.id);
  return extra ? { ...row, ...extra } : row;
}

function toBusinessSummary(b: BusinessRow): BusinessSummary {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    category: b.category,
    location: b.location,
    verified: b.status === "approved",
    logoUrl: publicMediaUrl("listing-media", b.logo_path),
  };
}

function toBusinessDetail(b: BusinessRow): BusinessDetail {
  return {
    ...toBusinessSummary(b),
    ownerId: b.owner_id,
    description: b.description,
    website: b.website,
    contactEmail: b.contact_email,
    registrationNumber: b.registration_number ?? null,
    status: b.status,
    reviewNote: b.review_note ?? null,
    evidencePaths: b.evidence_paths ?? [],
    logoPath: b.logo_path,
  };
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export async function getOwnBusiness(db: DbClient, viewer: Viewer): Promise<BusinessDetail | null> {
  const row = unwrap(
    await db.from("businesses").select(BUSINESS_PUBLIC_COLUMNS).eq("owner_id", viewer.id).order("created_at").limit(1).maybeSingle(),
  );
  return row ? toBusinessDetail(await withPrivate(db, row)) : null;
}

/** Public business page. Verification details are included only for the owner or a moderator. */
export async function getBusinessBySlug(db: DbClient, slug: string): Promise<BusinessDetail | null> {
  const row = unwrap(await db.from("businesses").select(BUSINESS_PUBLIC_COLUMNS).eq("slug", slug).maybeSingle());
  return row ? toBusinessDetail(await withPrivate(db, row)) : null;
}

export async function searchBusinesses(db: DbClient, q?: string): Promise<BusinessSummary[]> {
  let query = db.from("businesses").select(BUSINESS_PUBLIC_COLUMNS).eq("status", "approved").order("name").limit(PAGE);
  const term = q?.replace(/[%,()]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,location.ilike.%${term}%`);
  return unwrap(await query).map(toBusinessSummary);
}

export async function saveBusiness(db: DbClient, viewer: Viewer, input: z.infer<typeof businessSchema>): Promise<BusinessDetail> {
  if (input.logoPath) assertOwnedPath(viewer, input.logoPath);
  for (const p of input.evidencePaths ?? []) assertOwnedPath(viewer, p);
  const existing = await getOwnBusiness(db, viewer);
  const fields = {
    name: input.name,
    description: input.description ?? null,
    website: input.website ?? null,
    location: input.location ?? null,
    contact_email: input.contactEmail ?? null,
    registration_number: input.registrationNumber ?? null,
    logo_path: input.logoPath ?? null,
    ...(input.evidencePaths ? { evidence_paths: input.evidencePaths } : {}),
  };
  if (existing) {
    const row = unwrap(await db.from("businesses").update(fields).eq("id", existing.id).select(BUSINESS_PUBLIC_COLUMNS).single());
    return toBusinessDetail(await withPrivate(db, row));
  }
  const slug = `${slugify(input.name) || "business"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await db
    .from("businesses")
    .insert({ ...fields, owner_id: viewer.id, slug, category: input.category })
    .select(BUSINESS_PUBLIC_COLUMNS)
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "A Luxury Business membership is required to create a business profile.");
  throwIfError(error);
  return toBusinessDetail(await withPrivate(db, data!));
}

export async function submitBusiness(db: DbClient, businessId: string) {
  unwrap(await db.rpc("submit_business_for_review", { p_id: businessId }));
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
type ListingRow = {
  id: string;
  business_id: string;
  title: string;
  slug: string;
  category: ListingCategory;
  summary: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  price_from_minor: number | null;
  currency: string | null;
  price_unit: string | null;
  amenities: string[];
  visibility: "public" | "members";
  status: ListingDetail["status"];
  cover_path: string | null;
  approved_at: string | null;
  review_note: string | null;
  published_at: string | null;
  created_at: string;
};

async function toCards(db: DbClient, viewer: Viewer | null, rows: ListingRow[]): Promise<ListingCard[]> {
  if (rows.length === 0) return [];
  const businessIds = [...new Set(rows.map((r) => r.business_id))];
  const [businesses, saves] = await Promise.all([
    db.from("businesses").select(BUSINESS_PUBLIC_COLUMNS).in("id", businessIds),
    viewer
      ? db.from("listing_saves").select("listing_id").eq("user_id", viewer.id).in("listing_id", rows.map((r) => r.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const bmap = new Map(unwrap(businesses).map((b) => [b.id, toBusinessSummary(b)]));
  const saved = new Set(unwrap(saves).map((s) => s.listing_id));
  return rows
    .filter((r) => bmap.has(r.business_id))
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      summary: r.summary,
      city: r.city,
      country: r.country,
      priceFromMinor: r.price_from_minor,
      currency: r.currency,
      priceUnit: r.price_unit,
      visibility: r.visibility,
      coverUrl: publicMediaUrl("listing-media", r.cover_path),
      business: bmap.get(r.business_id)!,
      savedByViewer: saved.has(r.id),
    }));
}

/** Published listings visible to the viewer (RLS: public, or members-only with the luxury feature). */
export async function browseListings(db: DbClient, viewer: Viewer | null, filters: ListingBrowse): Promise<Page<ListingCard>> {
  let query = db
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (filters.category) query = query.eq("category", filters.category);
  const q = filters.q?.replace(/[%,()]/g, " ").trim();
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
  const loc = filters.location?.replace(/[%,()]/g, " ").trim();
  if (loc) query = query.or(`city.ilike.%${loc}%,country.ilike.%${loc}%`);
  const c = decodeCursor(filters.cursor);
  if (c) query = query.or(`published_at.lt.${c.t},and(published_at.eq.${c.t},id.lt.${c.id})`);
  const rows = unwrap(await query);
  const page = toPage(rows, PAGE, (r) => ({ t: r.published_at ?? r.created_at, id: r.id }));
  return { items: await toCards(db, viewer, page.items), nextCursor: page.nextCursor };
}

export async function getListingBySlug(db: DbClient, viewer: Viewer | null, slug: string): Promise<ListingDetail | null> {
  const row = unwrap(await db.from("listings").select(LISTING_COLUMNS).eq("slug", slug).maybeSingle());
  return row ? toDetail(db, viewer, row) : null;
}

export async function getListingById(db: DbClient, viewer: Viewer | null, id: string): Promise<ListingDetail | null> {
  const row = unwrap(await db.from("listings").select(LISTING_COLUMNS).eq("id", id).maybeSingle());
  return row ? toDetail(db, viewer, row) : null;
}

async function toDetail(db: DbClient, viewer: Viewer | null, row: ListingRow): Promise<ListingDetail | null> {
  const [card] = await toCards(db, viewer, [row]);
  if (!card) return null;
  const media = unwrap(await db.from("listing_media").select("*").eq("listing_id", row.id).order("position"));
  const business = unwrap(await db.from("businesses").select("owner_id").eq("id", row.business_id).single());
  return {
    ...card,
    description: row.description,
    amenities: row.amenities,
    status: row.status,
    reviewNote: row.review_note,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    coverPath: row.cover_path,
    media: media.map((m) => ({ id: m.id, url: publicMediaUrl("listing-media", m.storage_path), alt: m.alt_text, path: m.storage_path })),
    isOwner: viewer?.id === business.owner_id,
  };
}

export async function listOwnListings(db: DbClient, viewer: Viewer): Promise<ListingDetail[]> {
  const business = await getOwnBusiness(db, viewer);
  if (!business) return [];
  const rows = unwrap(await db.from("listings").select(LISTING_COLUMNS).eq("business_id", business.id).order("created_at", { ascending: false }).limit(100));
  const details = await Promise.all(rows.map((r) => toDetail(db, viewer, r)));
  return details.filter((d): d is ListingDetail => d !== null);
}

function listingFields(input: z.infer<typeof listingSchema>) {
  return {
    title: input.title,
    category: input.category,
    summary: input.summary ?? null,
    description: input.description ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    price_from_minor: input.priceFrom != null && input.currency ? toMinorUnits(input.priceFrom, input.currency) : null,
    currency: input.priceFrom != null ? (input.currency ?? null) : null,
    price_unit: input.priceUnit ?? null,
    amenities: input.amenities ?? [],
    visibility: input.visibility,
    cover_path: input.coverPath ?? null,
  };
}

export async function createListing(db: DbClient, viewer: Viewer, input: z.infer<typeof listingSchema>): Promise<{ id: string; slug: string }> {
  if (input.coverPath) assertOwnedPath(viewer, input.coverPath);
  const business = await getOwnBusiness(db, viewer);
  if (!business) throw new AppError("business_rule", "Create your business profile first.");
  const slug = `${slugify(input.title) || "listing"}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await db
    .from("listings")
    .insert({ ...listingFields(input), business_id: business.id, slug })
    .select("id, slug")
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "A Luxury Business membership is required to create listings.");
  throwIfError(error);
  return data!;
}

export async function updateListing(db: DbClient, viewer: Viewer, id: string, input: z.infer<typeof listingSchema>) {
  if (input.coverPath) assertOwnedPath(viewer, input.coverPath);
  const rows = unwrap(await db.from("listings").update(listingFields(input)).eq("id", id).select("id, status"));
  if (rows.length === 0) throw new AppError("not_found", "Listing not found, or it cannot be edited while under review.");
  return { status: rows[0]!.status };
}

export async function deleteListing(db: DbClient, id: string) {
  const rows = unwrap(await db.from("listings").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("business_rule", "Only draft, rejected or archived listings can be deleted.");
}

export async function applyListingAction(db: DbClient, id: string, action: "submit" | "archive" | "publish" | "draft") {
  if (action === "submit") unwrap(await db.rpc("submit_listing", { p_id: id }));
  else {
    const status = action === "archive" ? "archived" : action === "publish" ? "published" : "draft";
    unwrap(await db.rpc("set_listing_status", { p_id: id, p_status: status }));
  }
}

export async function addListingMedia(db: DbClient, viewer: Viewer, listingId: string, path: string, alt?: string) {
  assertOwnedPath(viewer, path);
  const count = unwrap(await db.from("listing_media").select("id").eq("listing_id", listingId));
  if (count.length >= 20) throw new AppError("business_rule", "Listings can have up to 20 images.");
  unwrap(
    await db.from("listing_media").insert({ listing_id: listingId, storage_path: path, alt_text: alt ?? null, position: count.length }),
  );
}

export async function removeListingMedia(db: DbClient, mediaId: string) {
  const rows = unwrap(await db.from("listing_media").delete().eq("id", mediaId).select("storage_path"));
  if (rows.length === 0) throw new AppError("not_found", "Image not found.");
  await db.storage.from("listing-media").remove(rows.map((r) => r.storage_path));
}

export async function setListingSaved(db: DbClient, viewer: Viewer, listingId: string, saved: boolean) {
  if (saved) {
    const { error } = await db.from("listing_saves").insert({ user_id: viewer.id, listing_id: listingId });
    if (error && error.code !== "23505") throwIfError(error);
  } else {
    unwrap(await db.from("listing_saves").delete().eq("user_id", viewer.id).eq("listing_id", listingId));
  }
}

export async function listSavedListings(db: DbClient, viewer: Viewer): Promise<ListingCard[]> {
  const saves = unwrap(
    await db.from("listing_saves").select("listing_id").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(100),
  );
  if (saves.length === 0) return [];
  const rows = unwrap(await db.from("listings").select(LISTING_COLUMNS).in("id", saves.map((s) => s.listing_id)));
  return toCards(db, viewer, rows);
}

// ---------------------------------------------------------------------------
// Inquiries (a request to be contacted — never a booking confirmation)
// ---------------------------------------------------------------------------
export async function createInquiry(db: DbClient, viewer: Viewer, listingId: string, input: z.infer<typeof inquirySchema>) {
  const { data, error } = await db
    .from("listing_inquiries")
    .insert({
      listing_id: listingId,
      sender_id: viewer.id,
      message: input.message,
      preferred_dates: input.preferredDates ?? null,
      party_size: input.partySize ?? null,
    })
    .select("id")
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "Direct inquiries are included with Premium membership.");
  throwIfError(error);
  return data!;
}

async function inquiryViews(db: DbClient, rows: { id: string; listing_id: string; sender_id: string; message: string; preferred_dates: string | null; party_size: number | null; status: InquiryView["status"]; created_at: string }[]): Promise<InquiryView[]> {
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const listings = listingIds.length ? unwrap(await db.from("listings").select("id, title, slug").in("id", listingIds)) : [];
  const lmap = new Map(listings.map((l) => [l.id, l]));
  const senders = await getSummaries(db, rows.map((r) => r.sender_id));
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listing_id,
    listingTitle: lmap.get(r.listing_id)?.title ?? "Listing",
    listingSlug: lmap.get(r.listing_id)?.slug ?? "",
    message: r.message,
    preferredDates: r.preferred_dates,
    partySize: r.party_size,
    status: r.status,
    createdAt: r.created_at,
    senderName: senders.get(r.sender_id)?.displayName ?? "Member",
    senderHandle: senders.get(r.sender_id)?.handle ?? "",
  }));
}

export async function listReceivedInquiries(db: DbClient, viewer: Viewer): Promise<InquiryView[]> {
  const business = await getOwnBusiness(db, viewer);
  if (!business) return [];
  const listingIds = unwrap(await db.from("listings").select("id").eq("business_id", business.id)).map((l) => l.id);
  if (listingIds.length === 0) return [];
  const rows = unwrap(
    await db.from("listing_inquiries").select("*").in("listing_id", listingIds).order("created_at", { ascending: false }).limit(100),
  );
  return inquiryViews(db, rows);
}

export async function listSentInquiries(db: DbClient, viewer: Viewer): Promise<InquiryView[]> {
  const rows = unwrap(
    await db.from("listing_inquiries").select("*").eq("sender_id", viewer.id).order("created_at", { ascending: false }).limit(100),
  );
  return inquiryViews(db, rows);
}

export async function updateInquiryStatus(db: DbClient, id: string, status: InquiryView["status"]) {
  const rows = unwrap(await db.from("listing_inquiries").update({ status }).eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Inquiry not found.");
}

export async function businessContactForListing(db: DbClient, listingId: string): Promise<{ email: string | null; title: string } | null> {
  const listing = unwrap(await db.from("listings").select("title, business_id").eq("id", listingId).maybeSingle());
  if (!listing) return null;
  const business = unwrap(await db.from("businesses").select("contact_email").eq("id", listing.business_id).maybeSingle());
  return { email: business?.contact_email ?? null, title: listing.title };
}

/** Listing cards for specific ids, in the given order. Hidden or unpublished listings are skipped (RLS). */
export async function getListingCardsByIds(db: DbClient, viewer: Viewer, ids: string[]): Promise<ListingCard[]> {
  if (ids.length === 0) return [];
  const rows = unwrap(await db.from("listings").select(LISTING_COLUMNS).in("id", ids.slice(0, 200)).eq("status", "published"));
  const cards = await toCards(db, viewer, rows);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is ListingCard => Boolean(c));
}
