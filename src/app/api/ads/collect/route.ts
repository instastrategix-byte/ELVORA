import { isAppError } from "@/lib/errors";
import { logger } from "@backend/core/logger";
import { rateLimit } from "@backend/http/rate-limit";
import { pixelPayloadSchema, requestHost } from "@backend/modules/advertising/tracking/ingest";
import { ingestConversion } from "@backend/modules/advertising/tracking/service";

const MAX_BODY = 8 * 1024;

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cors(origin: string | null, allowed: boolean): HeadersInit {
  // Echo the origin only for events the integration accepted; never a wildcard.
  return origin && allowed ? { "access-control-allow-origin": origin, vary: "Origin" } : { vary: "Origin" };
}

/**
 * Public browser endpoint for the ELVORA pixel. No cookies or session are used. The pixel sends a
 * text/plain JSON beacon (a CORS "simple" request); the event is accepted only from the
 * integration's allowed domains and only with consent — both enforced in SQL.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!rateLimit(`ads-collect:${clientIp(request)}`, 120, 60_000).ok) {
    return new Response(null, { status: 429, headers: { ...cors(origin, false), "retry-after": "60" } });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413, headers: cors(origin, false) });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: cors(origin, false) });
  }
  const parsed = pixelPayloadSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid_event" }, { status: 400, headers: cors(origin, false) });
  if (!rateLimit(`ads-collect-pixel:${parsed.data.pixel}`, 600, 60_000).ok) {
    return new Response(null, { status: 429, headers: { ...cors(origin, false), "retry-after": "60" } });
  }
  try {
    const status = await ingestConversion({
      publicKey: parsed.data.pixel,
      payload: parsed.data,
      originHost: requestHost(request.headers),
      consent: parsed.data.consent,
    });
    const accepted = status === "stored" || status === "duplicate";
    return Response.json({ status }, { status: accepted ? 202 : status === "domain_not_allowed" ? 403 : 200, headers: cors(origin, accepted) });
  } catch (error) {
    if (!isAppError(error)) logger.error("ads.collect_failed", {});
    return new Response(null, { status: 503, headers: cors(origin, false) });
  }
}

export function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { "access-control-allow-origin": origin } : {}),
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    },
  });
}
