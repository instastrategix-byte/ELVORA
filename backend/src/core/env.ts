import "server-only";
import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_SECRET_KEY: optionalSecret,
  PAYMENTS_DEFAULT_PROVIDER: z.enum(["stripe", "razorpay"]).default("stripe"),
  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  RAZORPAY_KEY_ID: optionalSecret,
  RAZORPAY_KEY_SECRET: optionalSecret,
  RAZORPAY_WEBHOOK_SECRET: optionalSecret,
  EMAIL_PROVIDER: z.enum(["resend", "log"]).default("log"),
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().default("ELVORA <no-reply@example.com>"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}

/**
 * Production start-up validation (called from instrumentation.ts). Fails fast when a
 * required production dependency is missing instead of serving a half-configured app.
 */
export function assertProductionConfig(): void {
  const env = serverEnv();
  if (env.NODE_ENV !== "production") return;
  // Local E2E runs of a production build without a database (never set this in a deployment).
  if (process.env.ELVORA_ALLOW_UNCONFIGURED === "1" && !process.env.VERCEL && !process.env.CI_DEPLOY) return;
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!env.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");
  if (env.RAZORPAY_KEY_ID && (!env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET)) {
    missing.push("RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET");
  }
  if (missing.length) {
    throw new Error(`ELVORA production configuration incomplete: ${missing.join(", ")}`);
  }
}
