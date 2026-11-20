import { AppError, isAppError } from "@/lib/errors";
import { processWebhook } from "@backend/modules/billing/service";
import { jsonError } from "@backend/http/route";
import { logger } from "@backend/core/logger";

const MAX_BODY = 512 * 1024;

/**
 * Payment provider webhooks (/api/webhooks/stripe, /api/webhooks/razorpay).
 * The signature is verified over the exact raw body before anything is parsed or stored.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (provider !== "stripe" && provider !== "razorpay") return jsonError(new AppError("not_found", "Unknown provider."));
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return jsonError(new AppError("payload_too_large", "Payload too large."));
  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonError(new AppError("payload_too_large", "Payload too large."));
  try {
    const result = await processWebhook(provider, raw, request.headers);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (isAppError(error) && error.status < 500) {
      logger.warn("billing.webhook_rejected", { provider, code: error.code });
      return jsonError(error);
    }
    // 5xx makes the provider retry; processing is idempotent.
    logger.error("billing.webhook_failed", { provider, error });
    return jsonError(new AppError("internal", "Webhook processing failed."));
  }
}
