import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";
import { publicEnv } from "@/lib/env";
import type { Database } from "@backend/db/database.types";

export type DbClient = SupabaseClient<Database>;

/**
 * Request-scoped Supabase client acting as the signed-in user. Every query is subject to RLS.
 * Must be created per request (never cached globally).
 */
export async function createClient(): Promise<DbClient> {
  const env = publicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new AppError("service_unavailable", "The ELVORA data service is not configured.");
  }
  const cookieStore = await cookies();
  // Supabase reads the clock (token expiry). Runtime prefetches render with cookies, so mark
  // the client as IO to keep its results out of the prerender (no-op during real requests).
  await io();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
