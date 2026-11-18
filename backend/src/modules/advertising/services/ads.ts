import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { requireAdRole } from "../permissions";
import type { AdView } from "../types";
import type { adCreateSchema, adUpdateSchema } from "../validators";
import { AD_COLUMNS, toAd } from "./mappers";

export async function createAd(db: DbClient, input: z.infer<typeof adCreateSchema>): Promise<AdView> {
  const set = unwrap(await db.from("ad_sets").select("account_id").eq("id", input.adSetId).maybeSingle());
  if (!set) throw new AppError("not_found", "Ad set not found.");
  await requireAdRole(db, set.account_id, "editor");
  const row = unwrap(
    await db
      .from("advertisements")
      .insert({ ad_set_id: input.adSetId, creative_id: input.creativeId, name: input.name })
      .select(AD_COLUMNS)
      .single(),
  );
  return toAd(row);
}

/** Swapping the creative of a reviewed ad sends it back to review (enforced by a trigger). */
export async function updateAd(db: DbClient, adId: string, input: z.infer<typeof adUpdateSchema>): Promise<AdView> {
  const patch: { creative_id?: string; name?: string; status?: AdView["status"] } = {};
  if (input.creativeId) patch.creative_id = input.creativeId;
  if (input.name) patch.name = input.name;
  if (input.status) patch.status = input.status;
  const rows = unwrap(await db.from("advertisements").update(patch).eq("id", adId).select(AD_COLUMNS));
  if (!rows.length) throw new AppError("not_found", "Ad not found.");
  return toAd(rows[0]!);
}

export async function deleteAd(db: DbClient, adId: string) {
  const rows = unwrap(await db.from("advertisements").delete().eq("id", adId).select("id"));
  if (!rows.length) throw new AppError("business_rule", "Only ads that were never submitted can be deleted. Archive it instead.");
}

export async function submitAd(db: DbClient, adId: string) {
  unwrap(await db.rpc("submit_ad_for_review", { p_ad: adId }));
}
