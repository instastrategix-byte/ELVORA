import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/format";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { requireAdRole } from "../permissions";
import type { AdSetView } from "../types";
import { compactTargeting, type adSetCreateSchema, type adSetUpdateSchema } from "../validators";
import { AD_SET_COLUMNS, toAdSet } from "./mappers";

type AdSetInput = z.infer<typeof adSetUpdateSchema>;

function columns(input: AdSetInput, currency: string) {
  return {
    name: input.name,
    placements: input.placements,
    targeting: compactTargeting(input.targeting),
    bid_strategy: input.bidStrategy,
    bid_minor: input.bidStrategy === "lowest_cost" || !input.bidAmount ? null : toMinorUnits(input.bidAmount, currency),
    daily_budget_minor: input.dailyBudget ? toMinorUnits(input.dailyBudget, currency) : null,
    frequency_cap_per_day: input.frequencyCapPerDay,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
  };
}

async function campaignContext(db: DbClient, campaignId: string) {
  const c = unwrap(await db.from("ad_campaigns").select("advertiser_account_id, currency, structure").eq("id", campaignId).maybeSingle());
  if (!c) throw new AppError("not_found", "Campaign not found.");
  if (c.structure !== "managed") throw new AppError("business_rule", "This campaign uses the original single-ad format.");
  await requireAdRole(db, c.advertiser_account_id, "editor");
  return c;
}

export async function createAdSet(db: DbClient, input: z.infer<typeof adSetCreateSchema>): Promise<AdSetView> {
  const c = await campaignContext(db, input.campaignId);
  const row = unwrap(
    await db
      .from("ad_sets")
      .insert({ campaign_id: input.campaignId, ...columns(input, c.currency) })
      .select(AD_SET_COLUMNS)
      .single(),
  );
  return toAdSet(row);
}

export async function updateAdSet(db: DbClient, adSetId: string, input: AdSetInput): Promise<AdSetView> {
  const current = unwrap(await db.from("ad_sets").select("campaign_id").eq("id", adSetId).maybeSingle());
  if (!current) throw new AppError("not_found", "Ad set not found.");
  const c = await campaignContext(db, current.campaign_id);
  const row = unwrap(
    await db
      .from("ad_sets")
      .update({ ...columns(input, c.currency), ...(input.status ? { status: input.status } : {}) })
      .eq("id", adSetId)
      .select(AD_SET_COLUMNS)
      .single(),
  );
  return toAdSet(row);
}

export async function deleteAdSet(db: DbClient, adSetId: string) {
  const rows = unwrap(await db.from("ad_sets").delete().eq("id", adSetId).select("id"));
  if (!rows.length) throw new AppError("business_rule", "Only draft ad sets can be deleted. Archive it instead.");
}
