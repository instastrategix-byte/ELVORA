import "server-only";
import type { z } from "zod";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { requireAdRole } from "../permissions";
import type { AdView, CreativeView, ManagedCampaign, ReviewView } from "../types";
import type { resolveAppealSchema, reviewDecisionSchema, suspensionSchema } from "../validators";
import { signCreativeMedia } from "./creatives";
import { AD_COLUMNS, CAMPAIGN_COLUMNS, CREATIVE_COLUMNS, toAd, toCampaign, toCreative } from "./mappers";

/* Advertiser-facing review history and appeals, and the staff review console. */

export async function listAccountReviews(db: DbClient, accountId: string): Promise<ReviewView[]> {
  await requireAdRole(db, accountId, "analyst");
  const reviews = unwrap(
    await db
      .from("ad_reviews")
      .select("id, entity_type, entity_id, account_id, decision, reasons, note, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  const appeals = reviews.length
    ? unwrap(
        await db
          .from("ad_appeals")
          .select("id, review_id, status, resolution_note, created_at")
          .in(
            "review_id",
            reviews.map((r) => r.id),
          )
          .order("created_at", { ascending: false }),
      )
    : [];
  return reviews.map((r) => {
    const ap = appeals.find((a) => a.review_id === r.id);
    return {
      id: r.id,
      entityType: r.entity_type as ReviewView["entityType"],
      entityId: r.entity_id,
      accountId: r.account_id,
      decision: r.decision as ReviewView["decision"],
      reasons: r.reasons,
      note: r.note,
      createdAt: r.created_at,
      appeal: ap ? { id: ap.id, status: ap.status as "open" | "upheld" | "overturned", resolutionNote: ap.resolution_note } : null,
    };
  });
}

export async function appealReview(db: DbClient, reviewId: string, message: string): Promise<{ id: string }> {
  const id = unwrap(await db.rpc("appeal_ad_review", { p_review: reviewId, p_message: message }));
  return { id: id as string };
}

export type ReviewQueue = {
  campaigns: (ManagedCampaign & { accountName: string; ads: (AdView & { creative: CreativeView | null })[] })[];
  ads: (AdView & { campaignName: string; accountName: string; creative: CreativeView | null })[];
  appeals: { id: string; reviewId: string; accountId: string; accountName: string; message: string; createdAt: string; review: ReviewView | null }[];
};

/** Everything awaiting a moderator. Staff only (RLS lets moderators read all ad data). */
export async function reviewQueue(db: DbClient): Promise<ReviewQueue> {
  const [campaignRows, pendingAds, appealRows] = await Promise.all([
    db.from("ad_campaigns").select(CAMPAIGN_COLUMNS).eq("status", "pending_review").eq("structure", "managed").order("submitted_at").limit(50),
    db.from("advertisements").select(AD_COLUMNS).eq("review_status", "pending").order("updated_at").limit(200),
    db.from("ad_appeals").select("id, review_id, account_id, message, created_at").eq("status", "open").order("created_at").limit(50),
  ]);
  const campaigns = unwrap(campaignRows).map(toCampaign);
  const ads = unwrap(pendingAds).map(toAd);
  const appeals = unwrap(appealRows);
  const creativeIds = [...new Set(ads.map((a) => a.creativeId))];
  const creatives = creativeIds.length ? unwrap(await db.from("ad_creatives").select(CREATIVE_COLUMNS).in("id", creativeIds)) : [];
  const urls = await signCreativeMedia(db, creatives.flatMap((c) => (Array.isArray(c.media) ? (c.media as { path: string }[]).map((m) => m.path) : [])), 900);
  const creativeMap = new Map(creatives.map((c) => [c.id, toCreative(c, urls)]));
  const accountIds = [...new Set([...campaigns.map((c) => c.accountId), ...ads.map((a) => a.accountId), ...appeals.map((a) => a.account_id)])];
  const accounts = accountIds.length ? unwrap(await db.from("advertiser_accounts").select("id, display_name").in("id", accountIds)) : [];
  const accountName = new Map(accounts.map((a) => [a.id, a.display_name]));
  const pendingCampaignIds = new Set(campaigns.map((c) => c.id));
  const otherCampaignIds = [...new Set(ads.filter((a) => !pendingCampaignIds.has(a.campaignId)).map((a) => a.campaignId))];
  const otherCampaigns = otherCampaignIds.length ? unwrap(await db.from("ad_campaigns").select("id, name").in("id", otherCampaignIds)) : [];
  const campaignName = new Map([...campaigns.map((c) => [c.id, c.name] as const), ...otherCampaigns.map((c) => [c.id, c.name] as const)]);
  const reviewIds = appeals.map((a) => a.review_id);
  const reviews = reviewIds.length
    ? unwrap(await db.from("ad_reviews").select("id, entity_type, entity_id, account_id, decision, reasons, note, created_at").in("id", reviewIds))
    : [];

  return {
    campaigns: campaigns.map((c) => ({
      ...c,
      accountName: accountName.get(c.accountId) ?? "",
      ads: ads.filter((a) => a.campaignId === c.id).map((a) => ({ ...a, creative: creativeMap.get(a.creativeId) ?? null })),
    })),
    // Ads added to campaigns that are already running are reviewed one by one.
    ads: ads
      .filter((a) => !pendingCampaignIds.has(a.campaignId))
      .map((a) => ({ ...a, campaignName: campaignName.get(a.campaignId) ?? "", accountName: accountName.get(a.accountId) ?? "", creative: creativeMap.get(a.creativeId) ?? null })),
    appeals: appeals.map((a) => {
      const r = reviews.find((x) => x.id === a.review_id);
      return {
        id: a.id,
        reviewId: a.review_id,
        accountId: a.account_id,
        accountName: accountName.get(a.account_id) ?? "",
        message: a.message,
        createdAt: a.created_at,
        review: r
          ? {
              id: r.id,
              entityType: r.entity_type as ReviewView["entityType"],
              entityId: r.entity_id,
              accountId: r.account_id,
              decision: r.decision as ReviewView["decision"],
              reasons: r.reasons,
              note: r.note,
              createdAt: r.created_at,
              appeal: null,
            }
          : null,
      };
    }),
  };
}

type Decision = z.infer<typeof reviewDecisionSchema>;

export async function decideCampaign(db: DbClient, campaignId: string, d: Decision) {
  unwrap(await db.rpc("review_ad_campaign", { p_campaign: campaignId, p_decision: d.decision, p_reasons: d.reasons, p_note: d.note ?? null }));
}

export async function decideAd(db: DbClient, adId: string, d: Decision) {
  unwrap(await db.rpc("review_ad", { p_ad: adId, p_decision: d.decision, p_reasons: d.reasons, p_note: d.note ?? null }));
}

export async function setCampaignSuspension(db: DbClient, campaignId: string, s: z.infer<typeof suspensionSchema>) {
  unwrap(await db.rpc("set_ad_campaign_suspension", { p_campaign: campaignId, p_suspend: s.suspend, p_reasons: s.reasons, p_note: s.note ?? null }));
}

export async function setAccountSuspension(db: DbClient, accountId: string, s: z.infer<typeof suspensionSchema>) {
  unwrap(await db.rpc("set_ad_account_suspension", { p_account: accountId, p_suspend: s.suspend, p_reasons: s.reasons, p_note: s.note ?? null }));
}

export async function resolveAppeal(db: DbClient, appealId: string, r: z.infer<typeof resolveAppealSchema>) {
  unwrap(await db.rpc("resolve_ad_appeal", { p_appeal: appealId, p_overturn: r.overturn, p_note: r.note ?? null }));
}
