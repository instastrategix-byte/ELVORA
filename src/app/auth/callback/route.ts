import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@backend/db/server";

/** PKCE callback for email confirmation, password recovery and OAuth (Google). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/feed");
  const providerError = url.searchParams.get("error_description");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const failure = new URL("/sign-in", url.origin);
  failure.searchParams.set("error", providerError ? "provider" : "link");
  return NextResponse.redirect(failure);
}
