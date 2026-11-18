import { isAppError } from "@/lib/errors";
import { logger } from "@backend/core/logger";
import { rateLimit } from "@backend/http/rate-limit";
import { serverPayloadSchema, verifySignature } from "@backend/modules/advertising/tracking/ingest";
import { ingestConversion, signingSecret } from "@backend/modules/advertising/tracking/service";

const MAX_BODY = 16 * 1024;

/**
 * Server-to-server Conversions API, authenticated with an HMAC-SHA256 signature over
 * `${timestamp}.${rawBody}` using the integration's secret (5-minute tolerance).
 * Headers: X-Elvora-Key (integration public key), X-Elvora-Timestamp, X-Elvora-Signature.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-elvora-key") ?? "";
  if (!/^elvpx_[0-9a-f]{32}$/.test(key)) return Response.json({ error: "unknown_key" }, { status: 401 });
  if (!rateLimit(`ads-conversions:${key}`, 1200, 60_000).ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "payload_too_large" }, { status: 413 });

  try {
    const secret = await signingSecret(key);
    if (!secret) return Response.json({ error: "unknown_key" }, { status: 401 });
    const check = verifySignature(secret, request.headers.get("x-elvora-timestamp"), raw, request.headers.get("x-elvora-signature"));
    if (!check.ok) return Response.json({ error: `signature_${check.reason}` }, { status: 401 });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = serverPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_event", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    const status = await ingestConversion({
      publicKey: key,
      payload: parsed.data,
      originHost: null,
      consent: parsed.data.consent,
      occurredAt: parsed.data.occurred_at,
    });
    return Response.json({ status }, { status: status === "stored" || status === "duplicate" ? 202 : 422 });
  } catch (error) {
    if (!isAppError(error)) logger.error("ads.conversions_api_failed", {});
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
