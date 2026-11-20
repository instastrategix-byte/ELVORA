/** Route prefixes that require a signed-in user (checked optimistically in proxy.ts). */
const PROTECTED_PREFIXES = [
  "/home",
  "/feed",
  "/reels",
  "/events",
  "/opportunities",
  "/communities",
  "/search",
  "/connections",
  "/introductions",
  "/vouches",
  "/contacts",
  "/deal-rooms",
  "/messages",
  "/notifications",
  "/saved",
  "/business",
  "/ads",
  "/ads-manager",
  "/account",
  "/onboarding",
  "/admin",
  "/profile",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // URL parsing drops tabs/newlines and treats "\" like "/", so "/\t/evil.com" or "/\\evil.com"
  // would become protocol-relative. Reject control characters and backslashes outright, then
  // confirm the path still resolves to our own origin.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "http://elvora.invalid";
    const resolved = new URL(next, base);
    if (resolved.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return next;
}
