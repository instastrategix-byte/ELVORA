import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import type { AudienceKind } from "../constants";
import { requireAdRole } from "../permissions";
import type { AudienceView } from "../types";
import { audienceCreateSchema, compactTargeting, type estimateSchema } from "../validators";

const COLUMNS = "id, account_id, name, kind, definition, version, updated_at";

function toAudience(r: { id: string; account_id: string; name: string; kind: string; definition: unknown; version: number; updated_at: string }): AudienceView {
  const kind = r.kind as AudienceKind;
  return {
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    kind,
    definition: (r.definition ?? {}) as Record<string, unknown>,
    version: r.version,
    requiresIntegration: kind === "customer_list" || kind === "website",
    updatedAt: r.updated_at,
  };
}

export async function listAudiences(db: DbClient, accountId: string): Promise<AudienceView[]> {
  await requireAdRole(db, accountId, "analyst");
  return unwrap(await db.from("ad_audiences").select(COLUMNS).eq("account_id", accountId).order("updated_at", { ascending: false })).map(toAudience);
}

export async function createAudience(db: DbClient, input: z.output<typeof audienceCreateSchema>): Promise<AudienceView> {
  await requireAdRole(db, input.accountId, "editor");
  const definition = input.kind === "saved" || input.kind === "exclusion" ? compactTargeting(input.definition as never) : input.definition;
  const row = unwrap(
    await db
      .from("ad_audiences")
      .insert({ account_id: input.accountId, name: input.name, kind: input.kind, definition: definition as never })
      .select(COLUMNS)
      .single(),
  );
  return toAudience(row);
}

/** Changing the definition creates a new version; earlier versions are kept on the row. */
export async function updateAudience(db: DbClient, audienceId: string, input: { name?: string; definition?: unknown }): Promise<AudienceView> {
  const current = unwrap(await db.from("ad_audiences").select("account_id, kind, name").eq("id", audienceId).maybeSingle());
  if (!current) throw new AppError("not_found", "Audience not found.");
  await requireAdRole(db, current.account_id, "editor");
  const patch: { name?: string; definition?: never } = {};
  if (input.name) patch.name = input.name;
  if (input.definition !== undefined) {
    const parsed = audienceCreateSchema.safeParse({ accountId: current.account_id, name: input.name ?? current.name, kind: current.kind, definition: input.definition });
    if (!parsed.success) throw new AppError("validation_failed", "Some values are not valid.", { definition: [parsed.error.issues[0]?.message ?? "Invalid"] });
    const def = parsed.data.kind === "saved" || parsed.data.kind === "exclusion" ? compactTargeting(parsed.data.definition as never) : parsed.data.definition;
    patch.definition = def as never;
  }
  const row = unwrap(await db.from("ad_audiences").update(patch).eq("id", audienceId).select(COLUMNS).single());
  return toAudience(row);
}

export async function deleteAudience(db: DbClient, audienceId: string) {
  const inUse = unwrap(
    await db
      .from("ad_sets")
      .select("id")
      .or(`targeting->include_audience_ids.cs.["${audienceId}"],targeting->exclude_audience_ids.cs.["${audienceId}"]`)
      .limit(1),
  );
  if (inUse.length) throw new AppError("business_rule", "This audience is used by an ad set. Remove it there first.");
  const rows = unwrap(await db.from("ad_audiences").delete().eq("id", audienceId).select("id"));
  if (!rows.length) throw new AppError("not_found", "Audience not found.");
}

/**
 * Eligible members matching the targeting: counts only, rounded to 2 significant figures, and
 * null below the 100-member minimum (so nobody can be singled out).
 */
export async function estimateAudience(db: DbClient, input: z.infer<typeof estimateSchema>): Promise<{ estimate: number | null }> {
  const n = unwrap(await db.rpc("estimate_audience", { p_targeting: compactTargeting(input.targeting) as never, p_account: input.accountId ?? null }));
  return { estimate: n === null ? null : Number(n) };
}
