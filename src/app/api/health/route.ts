import { isSupabaseConfigured } from "@/lib/env";
import { configuredProviders } from "@backend/modules/billing/service";

/** Liveness + configuration summary. Reveals only which integrations are configured, never values. */
export async function GET() {
  return Response.json({
    status: "ok",
    integrations: {
      supabase: isSupabaseConfigured(),
      payments: configuredProviders(),
      email: process.env.EMAIL_PROVIDER === "resend" && Boolean(process.env.RESEND_API_KEY) ? "resend" : "log",
    },
  });
}
