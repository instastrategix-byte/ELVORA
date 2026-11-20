/**
 * HTTP security headers for every response (applied in next.config.ts).
 *
 * CSP notes:
 * - Scripts are limited to this origin. 'unsafe-inline' stays for scripts because Next.js streams
 *   inline RSC/bootstrap scripts and the theme script; nonces would force every page dynamic and
 *   break partial prerendering. External script injection is still blocked.
 * - Supabase (REST, Storage signed URLs, Realtime websockets) is the only third-party origin the
 *   browser talks to. Stripe/Razorpay/Google sign-in are full-page navigations, not embeds.
 * - Images allow any https source because some member content (e.g. link previews, business
 *   logos) can be remote; images can't execute code.
 */
export function supabaseOrigins(url: string | undefined): { http: string; ws: string } {
  try {
    if (url) {
      const u = new URL(url);
      return { http: u.origin, ws: `${u.protocol === "http:" ? "ws:" : "wss:"}//${u.host}` };
    }
  } catch {
    // fall through to the wildcard
  }
  return { http: "https://*.supabase.co", ws: "wss://*.supabase.co" };
}

export function contentSecurityPolicy({ supabaseUrl, dev }: { supabaseUrl?: string; dev: boolean }): string {
  const sb = supabaseOrigins(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", sb.http],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", sb.http, sb.ws, ...(dev ? ["ws:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders({ supabaseUrl, dev }: { supabaseUrl?: string; dev: boolean }) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ supabaseUrl, dev }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The camera is used by the in-app message camera (getUserMedia); nothing records audio.
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(self), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ];
}
