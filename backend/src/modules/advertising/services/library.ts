import "server-only";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { requireAdRole } from "../permissions";
import type { AdSetView, AdView } from "../types";
import { AD_COLUMNS, AD_SET_COLUMNS, toAd, toAdSet } from "./mappers";

/* Account-wide read models for the Ads Manager list pages. RLS limits rows to account members. */

export type AdSetListItem = AdSetView & { campaignName: string; adCount: number };
export type AdListItem = AdView & { campaignName: string; adSetName: string };

export async function listAccountAdSets(db: DbClient, accountId: string): Promise<AdSetListItem[]> {
  await requireAdRole(db, accountId, "analyst");
  const [sets, campaigns, ads] = await Promise.all([
    db.from("ad_sets").select(AD_SET_COLUMNS).eq("account_id", accountId).order("created_at", { ascending: false }).limit(500),
    db.from("ad_campaigns").select("id, name").eq("advertiser_account_id", accountId).limit(1000),
    db.from("advertisements").select("ad_set_id").eq("account_id", accountId).limit(5000),
  ]);
  const names = new Map(unwrap(campaigns).map((c) => [c.id, c.name]));
  const counts = new Map<string, number>();
  for (const a of unwrap(ads)) counts.set(a.ad_set_id, (counts.get(a.ad_set_id) ?? 0) + 1);
  return unwrap(sets).map((s) => {
    const view = toAdSet(s);
    return { ...view, campaignName: names.get(view.campaignId) ?? "", adCount: counts.get(view.id) ?? 0 };
  });
}

export async function listAccountAds(db: DbClient, accountId: string): Promise<AdListItem[]> {
  await requireAdRole(db, accountId, "analyst");
  const [ads, campaigns, sets] = await Promise.all([
    db.from("advertisements").select(AD_COLUMNS).eq("account_id", accountId).order("created_at", { ascending: false }).limit(500),
    db.from("ad_campaigns").select("id, name").eq("advertiser_account_id", accountId).limit(1000),
    db.from("ad_sets").select("id, name").eq("account_id", accountId).limit(1000),
  ]);
  const campaignNames = new Map(unwrap(campaigns).map((c) => [c.id, c.name]));
  const setNames = new Map(unwrap(sets).map((s) => [s.id, s.name]));
  return unwrap(ads).map((a) => {
    const view = toAd(a);
    return { ...view, campaignName: campaignNames.get(view.campaignId) ?? "", adSetName: setNames.get(view.adSetId) ?? "" };
  });
}

export type PromotableItems = {
  posts: { id: string; label: string }[];
  events: { id: string; label: string }[];
  businesses: { id: string; label: string }[];
  listings: { id: string; label: string }[];
};

/**
 * Things the viewer may promote. Mirrors the ad_creatives insert policy: own posts, events they
 * host, approved businesses they own and those businesses' listings.
 */
export async function listPromotableItems(db: DbClient, viewer: Viewer): Promise<PromotableItems> {
  const [posts, events, businesses] = await Promise.all([
    db.from("posts").select("id, body, created_at").eq("author_id", viewer.id).eq("status", "published").order("created_at", { ascending: false }).limit(30),
    db.from("events").select("id, title, starts_at").eq("host_id", viewer.id).order("starts_at", { ascending: false }).limit(30),
    db.from("businesses").select("id, name").eq("owner_id", viewer.id).eq("status", "approved").limit(20),
  ]);
  const biz = unwrap(businesses);
  const listings = biz.length
    ? unwrap(
        await db
          .from("listings")
          .select("id, title")
          .in(
            "business_id",
            biz.map((b) => b.id),
          )
          .limit(50),
      )
    : [];
  const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);
  return {
    posts: unwrap(posts).map((p) => ({ id: p.id, label: clip(p.body.replace(/\s+/g, " ").trim() || "Post") })),
    events: unwrap(events).map((e) => ({ id: e.id, label: e.title })),
    businesses: biz.map((b) => ({ id: b.id, label: b.name })),
    listings: listings.map((l) => ({ id: l.id, label: l.title })),
  };
}
