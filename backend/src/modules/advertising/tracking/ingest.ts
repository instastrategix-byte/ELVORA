import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/*
 * Pure helpers for conversion ingestion (no database access), shared by the public pixel
 * endpoint and the signed server API. See docs/ADS_TRACKING.md for the wire formats.
 */

export const CONVERSION_EVENTS = ["lead", "purchase", "sign_up", "page_view", "custom"] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XAF", "XOF"]);

/** Converts a major-unit amount (e.g. 19.99) to minor units for the currency. */
export function toMinor(value: number, currency: string): number {
  return Math.round(value * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

const base = {
  event: z.enum(CONVERSION_EVENTS),
  event_id: z.string().trim().min(1).max(128),
  custom_name: z.string().trim().min(1).max(60).optional(),
  elv_cid: z.uuid().optional(),
  value: z.number().finite().min(0).max(1_000_000_000).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((c) => c.toUpperCase())
    .optional(),
  page_url: z.url({ protocol: /^https?$/ }).max(500).optional(),
};

const refineEvent = <T extends { event: ConversionEvent; custom_name?: string; value?: number; currency?: string }>(v: T, ctx: z.RefinementCtx) => {
  if (v.event === "custom" && !v.custom_name) ctx.addIssue({ code: "custom", message: "custom_name is required for custom events", path: ["custom_name"] });
  if (v.value !== undefined && !v.currency) ctx.addIssue({ code: "custom", message: "currency is required with value", path: ["currency"] });
};

/** Browser pixel payload (sent with navigator.sendBeacon as text/plain JSON). */
export const pixelPayloadSchema = z
  .object({ pixel: z.string().regex(/^elvpx_[0-9a-f]{32}$/), consent: z.boolean(), ...base })
  .strict()
  .superRefine(refineEvent);
export type PixelPayload = z.infer<typeof pixelPayloadSchema>;

/** Server API payload. Consent must be affirmed by the advertiser for each event. */
export const serverPayloadSchema = z
  .object({ consent: z.literal(true), occurred_at: z.iso.datetime({ offset: true }).optional(), ...base })
  .strict()
  .superRefine(refineEvent);
export type ServerPayload = z.infer<typeof serverPayloadSchema>;

/** Strips query strings and fragments from page URLs so no personal data in parameters is stored. */
export function sanitizePageUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

/** Host name of the Origin header (or Referer as a fallback), lower-cased; null if absent/invalid. */
export function requestHost(headers: Headers): string | null {
  const raw = headers.get("origin") ?? headers.get("referer");
  if (!raw || raw === "null") return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Expected value of the X-Elvora-Signature header: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>. */
export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

/** Verifies a server API signature in constant time, rejecting stale or future timestamps. */
export function verifySignature(
  secret: string,
  timestamp: string | null,
  rawBody: string,
  signature: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): { ok: true } | { ok: false; reason: "missing" | "stale" | "mismatch" } {
  if (!timestamp || !signature) return { ok: false, reason: "missing" };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };
  const expected = Buffer.from(signPayload(secret, timestamp, rawBody));
  const given = Buffer.from(signature.trim());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "mismatch" };
  return { ok: true };
}
