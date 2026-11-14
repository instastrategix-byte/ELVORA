import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@backend/core/env";
import type { DbClient } from "./server";

/**
 * Service-role client. BYPASSES RLS. Only for trusted server-side flows that have no user
 * session — currently payment webhooks. Never import from client components (enforced by
 * `server-only`), never log its key, never pass user-chosen ids without validation.
 */
export function createAdminClient(): DbClient {
  const url = publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new AppError("service_unavailable", "Server-side Supabase credentials are not configured.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as DbClient;
}
