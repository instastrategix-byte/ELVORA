import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { AD_MEDIA_BUCKET, AD_MEDIA_TYPES } from "../constants";
import { requireAdRole } from "../permissions";
import type { CreativeView } from "../types";
import type { creativeCreateSchema, creativeUpdateSchema, mediaUploadSchema } from "../validators";
import { CREATIVE_COLUMNS, toCreative } from "./mappers";

type CreativeInput = z.infer<typeof creativeUpdateSchema>;

/** Short-lived signed URLs for account media (account members can read via storage RLS). */
export async function signCreativeMedia(db: DbClient, paths: string[], seconds = 3600): Promise<Map<string, string | null>> {
  const unique = [...new Set(paths)];
  const map = new Map<string, string | null>();
  if (!unique.length) return map;
  const { data } = await db.storage.from(AD_MEDIA_BUCKET).createSignedUrls(unique, seconds);
  for (const item of data ?? []) if (item.path) map.set(item.path, item.signedUrl ?? null);
  return map;
}

function columns(input: CreativeInput) {
  return {
    name: input.name,
    format: input.format,
    primary_text: input.primaryText ?? null,
    headline: input.headline ?? null,
    description: input.description ?? null,
    cta: input.cta,
    destination_url: input.destinationUrl ?? null,
    url_params: input.urlParams ?? null,
    media: input.media.map((m) => ({ path: m.path, kind: m.kind, width: m.width ?? null, height: m.height ?? null, durationS: m.durationS ?? null })),
    post_id: input.postId ?? null,
    listing_id: input.listingId ?? null,
    event_id: input.eventId ?? null,
    business_id: input.businessId ?? null,
  };
}

function checkMediaOwnership(accountId: string, input: CreativeInput) {
  for (const m of input.media) {
    if (!m.path.startsWith(`${accountId}/`)) throw new AppError("validation_failed", "Media must be uploaded to this account.", { media: ["Upload the file to this account first"] });
  }
}

export async function listCreatives(db: DbClient, accountId: string): Promise<CreativeView[]> {
  await requireAdRole(db, accountId, "analyst");
  const rows = unwrap(await db.from("ad_creatives").select(CREATIVE_COLUMNS).eq("account_id", accountId).order("created_at", { ascending: false }).limit(200));
  const urls = await signCreativeMedia(db, rows.flatMap((r) => (Array.isArray(r.media) ? (r.media as { path: string }[]).map((m) => m.path) : [])));
  return rows.map((r) => toCreative(r, urls));
}

export async function createCreative(db: DbClient, input: z.infer<typeof creativeCreateSchema>): Promise<{ id: string }> {
  await requireAdRole(db, input.accountId, "editor");
  checkMediaOwnership(input.accountId, input);
  const row = unwrap(await db.from("ad_creatives").insert({ account_id: input.accountId, ...columns(input) }).select("id").single());
  return { id: row.id };
}

/** Editing an approved creative sends it (and its ads) back to review — enforced by a trigger. */
export async function updateCreative(db: DbClient, creativeId: string, input: CreativeInput) {
  const current = unwrap(await db.from("ad_creatives").select("account_id").eq("id", creativeId).maybeSingle());
  if (!current) throw new AppError("not_found", "Creative not found.");
  await requireAdRole(db, current.account_id, "editor");
  checkMediaOwnership(current.account_id, input);
  unwrap(await db.from("ad_creatives").update(columns(input)).eq("id", creativeId).select("id").single());
}

export async function deleteCreative(db: DbClient, creativeId: string) {
  const rows = unwrap(await db.from("ad_creatives").delete().eq("id", creativeId).select("id"));
  if (!rows.length) throw new AppError("business_rule", "This creative is used by an ad. Remove it from those ads first.");
}

/** Signed upload URL into `<account>/<uuid>.<ext>` in the private ad-media bucket. */
export async function createMediaUpload(
  db: DbClient,
  input: z.infer<typeof mediaUploadSchema>,
): Promise<{ path: string; token: string; signedUrl: string; kind: "image" | "video" }> {
  await requireAdRole(db, input.accountId, "editor");
  const type = AD_MEDIA_TYPES[input.mimeType as keyof typeof AD_MEDIA_TYPES];
  const path = `${input.accountId}/${crypto.randomUUID()}.${type.ext}`;
  const result = unwrap(await db.storage.from(AD_MEDIA_BUCKET).createSignedUploadUrl(path));
  return { path: result.path, token: result.token, signedUrl: result.signedUrl, kind: type.kind };
}
