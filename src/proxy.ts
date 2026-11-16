import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@backend/db/proxy";

export async function proxy(request: NextRequest) {
  // Supabase falls back to the Site URL root when a redirect isn't allow-listed (or an email
  // template links there). Hand any auth code that lands on "/" to the real callback.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/" && searchParams.has("code")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    return NextResponse.redirect(callback);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, images and payment webhooks (which carry no session).
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
