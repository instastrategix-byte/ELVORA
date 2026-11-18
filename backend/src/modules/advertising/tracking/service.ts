import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { createAdminClient } from "@backend/db/admin";
import { unwrap } from "@backend/http/db-errors";
import { logger } from "@backend/core/logger";
import { CONVERSION_EVENTS, sanitizePageUrl, toMinor, type PixelPayload, type ServerPayload } from "./ingest";

const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, { error: "Use a plain host name such as shop.example.com" });

export const integrationCreateSchema = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["pixel", "server"]),
    domains: z.array(hostname).max(20).default([]),
    attributionWindowDays: z.union([z.literal(1), z.literal(7), z.literal(28)]).default(7),
  })
  .refine((v) => v.kind === "server" || v.domains.length > 0, { error: "Add at least one website domain for a pixel", path: ["domains"] });

export const integrationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  domains: z.array(hostname).max(20),
  attributionWindowDays: z.union([z.literal(1), z.literal(7), z.literal(28)]),
});

export type TrackingIntegration = {
  id: string;
  name: string;
  kind: "pixel" | "server";
  publicKey: string;
  secretFingerprint: string | null;
  allowedDomains: string[];
  attributionWindowDays: number;
  verifiedAt: string | null;
  lastEventAt: string | null;
  createdAt: string;
};

export async function listIntegrations(db: DbClient, accountId: string): Promise<TrackingIntegration[]> {
  const rows = unwrap(
    await db.from("ad_tracking_integrations").select("*").eq("account_id", accountId).order("created_at", { ascending: false }).limit(50),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    publicKey: r.public_key,
    // Only the last 6 characters of the hash — enough to tell secrets apart, useless to an attacker.
    secretFingerprint: r.secret_hash ? r.secret_hash.slice(-6) : null,
    allowedDomains: r.allowed_domains,
    attributionWindowDays: r.attribution_window_days,
    verifiedAt: r.verified_at,
    lastEventAt: r.last_event_at,
    createdAt: r.created_at,
  }));
}

/** Creates an integration. A server integration's signing secret is returned once and never again. */
export async function createIntegration(db: DbClient, input: z.infer<typeof integrationCreateSchema>) {
  const rows = unwrap(
    await db.rpc("create_ad_tracking_integration", {
      p_account: input.accountId,
      p_name: input.name,
      p_kind: input.kind,
      p_domains: input.domains,
      p_window: input.attributionWindowDays,
    }),
  );
  const row = rows[0];
  if (!row) throw new AppError("internal", "The integration could not be created.");
  return { id: row.integration_id, publicKey: row.public_key, secret: row.secret };
}

export async function rotateSecret(db: DbClient, integrationId: string): Promise<{ secret: string }> {
  return { secret: unwrap(await db.rpc("rotate_ad_tracking_secret", { p_integration: integrationId })) as string };
}

export async function updateIntegration(db: DbClient, integrationId: string, input: z.infer<typeof integrationUpdateSchema>) {
  unwrap(
    await db.rpc("update_ad_tracking_integration", {
      p_integration: integrationId,
      p_name: input.name,
      p_domains: input.domains,
      p_window: input.attributionWindowDays,
    }),
  );
}

export async function deleteIntegration(db: DbClient, integrationId: string) {
  unwrap(await db.rpc("delete_ad_tracking_integration", { p_integration: integrationId }));
}

export async function listDiagnostics(db: DbClient, integrationId: string) {
  return unwrap(
    await db
      .from("ad_tracking_diagnostics")
      .select("id, level, code, message, created_at")
      .eq("integration_id", integrationId)
      .order("id", { ascending: false })
      .limit(100),
  );
}

export const conversionSummaryQuery = z.object({
  account: z.uuid(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type ConversionSummary = {
  from: string;
  to: string;
  truncated: boolean;
  byEvent: { event: string; total: number; attributed: number; valueMinor: Record<string, number> }[];
};

const SUMMARY_ROW_CAP = 20_000;

/** Conversion totals by event for a date range (UTC days, inclusive). */
export async function conversionSummary(db: DbClient, q: z.infer<typeof conversionSummaryQuery>): Promise<ConversionSummary> {
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? new Date(Date.parse(to) - 29 * 86_400_000).toISOString().slice(0, 10);
  const rows = unwrap(
    await db
      .from("ad_conversions")
      .select("event_name, custom_name, attributed, value_minor, currency")
      .eq("account_id", q.account)
      .gte("occurred_at", `${from}T00:00:00Z`)
      .lt("occurred_at", new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString())
      .limit(SUMMARY_ROW_CAP + 1),
  );
  const map = new Map<string, ConversionSummary["byEvent"][number]>();
  for (const r of rows.slice(0, SUMMARY_ROW_CAP)) {
    const key = r.event_name === "custom" ? `custom:${r.custom_name}` : r.event_name;
    const e = map.get(key) ?? { event: key, total: 0, attributed: 0, valueMinor: {} };
    e.total += 1;
    if (r.attributed) e.attributed += 1;
    if (r.value_minor != null && r.currency) e.valueMinor[r.currency] = (e.valueMinor[r.currency] ?? 0) + r.value_minor;
    map.set(key, e);
  }
  const order = new Map<string, number>(CONVERSION_EVENTS.map((e, i) => [e, i]));
  return {
    from,
    to,
    truncated: rows.length > SUMMARY_ROW_CAP,
    byEvent: [...map.values()].sort((a, b) => (order.get(a.event) ?? 99) - (order.get(b.event) ?? 99) || a.event.localeCompare(b.event)),
  };
}

export type IngestStatus = "stored" | "duplicate" | "no_consent" | "domain_not_allowed" | "unknown_integration" | "too_old";

/**
 * Stores a conversion through the service-role-only SQL function, which enforces consent,
 * domain allow-lists, de-duplication and attribution. Never trusts the browser for any of those.
 */
export async function ingestConversion(input: {
  publicKey: string;
  payload: PixelPayload | ServerPayload;
  originHost: string | null;
  consent: boolean;
  occurredAt?: string;
}): Promise<IngestStatus> {
  const p = input.payload;
  const { data, error } = await createAdminClient().rpc("ingest_ad_conversion", {
    p_public_key: input.publicKey,
    p_event_name: p.event,
    p_event_id: p.event_id,
    p_consent: input.consent,
    p_origin_host: input.originHost,
    p_click_id: p.elv_cid ?? null,
    p_value_minor: p.value !== undefined && p.currency ? toMinor(p.value, p.currency) : null,
    p_currency: p.currency ?? null,
    p_page_url: sanitizePageUrl(p.page_url),
    p_custom_name: p.custom_name ?? null,
    p_occurred_at: input.occurredAt ?? null,
  });
  if (error) {
    logger.error("ads.conversion_ingest_failed", { code: error.code });
    throw new AppError("internal", "The event could not be recorded.");
  }
  return data as IngestStatus;
}

/** Signing secret for a server integration (service role). Null when the key is unknown. */
export async function signingSecret(publicKey: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("ad_tracking_signing_secret", { p_public_key: publicKey });
  if (error) throw new AppError("internal", "Verification is temporarily unavailable.");
  return (data as string | null) ?? null;
}
