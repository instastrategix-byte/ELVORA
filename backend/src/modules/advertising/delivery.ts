import "server-only";
import { AppError } from "@/lib/errors";
import { isSafeDestination } from "@/lib/safe-url";
import { createAdminClient } from "@backend/db/admin";
import type { DbClient } from "@backend/db/server";
import { logger } from "@backend/core/logger";
import { unwrap } from "@backend/http/db-errors";
import { AD_MEDIA_BUCKET, type AdPlacement, type CreativeFormat, type Cta } from "./constants";
import type { MediaItem, SponsoredAd } from "./types";

/*
 * Delivery. Eligibility, budgets, balance, frequency caps and impression recording all happen
 * inside serve_ads_v2 (one transaction in the database). This module only shapes the result and
 * signs media from the private ad-media bucket for the ads that were actually served.
 */

async function signServedMedia(paths: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!paths.length) return map;
  try {
    // Viewers can't read the advertiser's bucket; only media of ads that were just served
    // (approved and eligible) is signed, for 10 minutes.
    const admin = createAdminClient();
    const { data } = await admin.storage.from(AD_MEDIA_BUCKET).createSignedUrls([...new Set(paths)], 600);
    for (const item of data ?? []) if (item.path) map.set(item.path, item.signedUrl ?? null);
  } catch (error) {
    logger.warn("ads.media_sign_failed", { error: error instanceof Error ? error.message : String(error) });
  }
  return map;
}

export async function serveSponsored(db: DbClient, placement: AdPlacement | "luxury", limit = 1): Promise<SponsoredAd[]> {
  const rows = unwrap(await db.rpc("serve_ads_v2", { p_placement: placement, p_limit: limit }));
  const media = rows.flatMap((r) => (Array.isArray(r.media) ? (r.media as MediaItem[]) : []));
  const urls = await signServedMedia(media.map((m) => m.path));
  return rows.map((r) => ({
    impressionId: r.impression_id,
    adId: r.ad_id,
    campaignId: r.campaign_id,
    format: r.format as CreativeFormat | "text",
    primaryText: r.primary_text,
    headline: r.headline,
    description: r.description,
    cta: r.cta as Cta,
    media: (Array.isArray(r.media) ? (r.media as MediaItem[]) : []).map((m) => ({ kind: m.kind, url: urls.get(m.path) ?? null, width: m.width, height: m.height })),
    advertiserName: r.advertiser_name,
    hasDestination: Boolean(r.destination_url || r.listing_id || r.post_id || r.event_id || r.business_id),
  }));
}

/**
 * Records a click (once per impression) and resolves where to send the member: the advertiser's
 * URL (with tracking parameters and the ELVORA click id), or the promoted item on ELVORA.
 */
export async function recordSponsoredClick(db: DbClient, impressionId: string): Promise<{ url: string }> {
  const [row] = unwrap(await db.rpc("record_ad_click_v2", { p_impression: impressionId }));
  if (!row) throw new AppError("not_found", "This ad is no longer available.");
  // Defence in depth: only ever hand the browser an https URL (never javascript:, data: etc.).
  if (row.destination_url) {
    if (isSafeDestination(row.destination_url)) return { url: row.destination_url };
    throw new AppError("not_found", "This ad has no valid destination.");
  }
  if (row.listing_id) {
    const listing = unwrap(await db.from("listings").select("slug").eq("id", row.listing_id).maybeSingle());
    if (listing) return { url: `/luxury/${listing.slug}` };
  }
  if (row.post_id) return { url: `/posts/${row.post_id}` };
  if (row.event_id) return { url: `/events/${row.event_id}` };
  if (row.business_id) return { url: "/discover?tab=businesses" };
  throw new AppError("not_found", "This ad has no destination.");
}
