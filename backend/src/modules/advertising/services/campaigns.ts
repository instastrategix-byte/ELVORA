import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/format";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { requireAdRole } from "../permissions";
import type { CampaignDetail, ManagedCampaign } from "../types";
import type { campaignCreateSchema, campaignUpdateSchema } from "../validators";
import { signCreativeMedia } from "./creatives";
import { AD_COLUMNS, AD_SET_COLUMNS, CAMPAIGN_COLUMNS, CREATIVE_COLUMNS, toAd, toAdSet, toCampaign, toCreative } from "./mappers";

type CampaignInput = z.infer<typeof campaignUpdateSchema>;

function daysInclusive(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);
}

/**
 * Budgets in minor units. Daily campaigns: the lifetime total defaults to daily × days.
 * Lifetime campaigns: the daily column holds the total (no separate daily limit).
 */
function budgetColumns(input: CampaignInput, currency: string) {
  const daily = input.dailyBudget ? toMinorUnits(input.dailyBudget, currency) : null;
  const total = input.totalBudget ? toMinorUnits(input.totalBudget, currency) : null;
  if (input.budgetType === "lifetime") {
    return { budget_type: "lifetime", daily_budget_minor: total!, total_budget_minor: total! };
  }
  return {
    budget_type: "daily",
    daily_budget_minor: daily!,
    total_budget_minor: total ?? daily! * daysInclusive(input.startsOn, input.endsOn),
  };
}

export async function listCampaigns(
  db: DbClient,
  accountId: string,
  opts: { q?: string; status?: string; archived?: boolean } = {},
): Promise<ManagedCampaign[]> {
  await requireAdRole(db, accountId, "analyst");
  let query = db
    .from("ad_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("advertiser_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(200);
  query = opts.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (opts.status) query = query.eq("status", opts.status as ManagedCampaign["status"]);
  const q = opts.q?.replace(/[%,()*\\]/g, " ").trim();
  if (q) query = query.ilike("name", `%${q}%`);
  return unwrap(await query).map(toCampaign);
}

export async function getCampaignDetail(db: DbClient, campaignId: string): Promise<CampaignDetail | null> {
  const row = unwrap(await db.from("ad_campaigns").select(CAMPAIGN_COLUMNS).eq("id", campaignId).maybeSingle());
  if (!row) return null;
  const [sets, ads] = await Promise.all([
    db.from("ad_sets").select(AD_SET_COLUMNS).eq("campaign_id", campaignId).order("created_at"),
    db.from("advertisements").select(AD_COLUMNS).eq("campaign_id", campaignId).order("created_at"),
  ]);
  const adRows = unwrap(ads).map(toAd);
  const creativeIds = [...new Set(adRows.map((a) => a.creativeId))];
  const creatives = creativeIds.length
    ? unwrap(await db.from("ad_creatives").select(CREATIVE_COLUMNS).in("id", creativeIds))
    : [];
  const urls = await signCreativeMedia(db, creatives.flatMap((c) => (Array.isArray(c.media) ? (c.media as { path: string }[]).map((m) => m.path) : [])));
  return {
    ...toCampaign(row),
    adSets: unwrap(sets).map((s) => ({ ...toAdSet(s), ads: adRows.filter((a) => a.adSetId === s.id) })),
    creatives: creatives.map((c) => toCreative(c, urls)),
  };
}

export async function createCampaign(db: DbClient, viewer: Viewer, input: z.infer<typeof campaignCreateSchema>): Promise<{ id: string }> {
  await requireAdRole(db, input.accountId, "editor");
  const account = unwrap(await db.from("advertiser_accounts").select("currency, status").eq("id", input.accountId).single());
  if (account.status !== "active") throw new AppError("forbidden", "This advertising account is suspended.");
  const row = unwrap(
    await db
      .from("ad_campaigns")
      .insert({
        advertiser_account_id: input.accountId,
        owner_id: viewer.id,
        name: input.name,
        objective: input.objective,
        currency: account.currency,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        structure: "managed",
        special_category: input.specialCategory,
        spend_cap_minor: input.spendCap ? toMinorUnits(input.spendCap, account.currency) : null,
        ...budgetColumns(input, account.currency),
      })
      .select("id")
      .single(),
  );
  return { id: row.id };
}

/** Draft and rejected campaigns are editable (enforced by RLS). */
export async function updateCampaign(db: DbClient, campaignId: string, input: CampaignInput) {
  const current = unwrap(await db.from("ad_campaigns").select("currency, status, structure").eq("id", campaignId).maybeSingle());
  if (!current) throw new AppError("not_found", "Campaign not found.");
  if (current.structure !== "managed") throw new AppError("business_rule", "Edit this campaign from the original campaign screen.");
  if (!["draft", "rejected"].includes(current.status)) {
    throw new AppError("business_rule", "Only draft or rejected campaigns can be edited. Pause it and duplicate to make changes.");
  }
  const rows = unwrap(
    await db
      .from("ad_campaigns")
      .update({
        name: input.name,
        objective: input.objective,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        special_category: input.specialCategory,
        spend_cap_minor: input.spendCap ? toMinorUnits(input.spendCap, current.currency) : null,
        ...budgetColumns(input, current.currency),
      })
      .eq("id", campaignId)
      .select("id"),
  );
  if (!rows.length) throw new AppError("forbidden", "Your role on this account can't edit campaigns.");
}

export async function deleteCampaign(db: DbClient, campaignId: string) {
  const rows = unwrap(await db.from("ad_campaigns").delete().eq("id", campaignId).select("id"));
  if (!rows.length) throw new AppError("business_rule", "Only draft or rejected campaigns can be deleted. Archive it instead.");
}

export async function campaignAction(
  db: DbClient,
  campaignId: string,
  action: "submit" | "pause" | "resume" | "archive" | "unarchive" | "duplicate",
): Promise<{ id: string }> {
  if (action === "submit") {
    unwrap(await db.rpc("submit_campaign_for_review", { p_campaign: campaignId }));
    return { id: campaignId };
  }
  if (action === "duplicate") {
    const id = unwrap(await db.rpc("duplicate_ad_campaign", { p_campaign: campaignId }));
    return { id: id as string };
  }
  unwrap(await db.rpc("set_ad_campaign_state", { p_campaign: campaignId, p_action: action }));
  return { id: campaignId };
}
