import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@backend/db/server";
import { assertSameOrigin } from "@backend/http/route";

/** POST-only sign-out (same-origin enforced) so it cannot be triggered by a cross-site link. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
