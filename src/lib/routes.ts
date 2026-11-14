/** Route prefixes that require a signed-in user (checked optimistically in proxy.ts). */
const PROTECTED_PREFIXES = [
  "/feed",
  "/connections",
  "/messages",
  "/notifications",
  "/saved",
  "/business",
  "/ads",
  "/account",
  "/onboarding",
  "/admin",
  "/profile",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-origin relative redirects (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined, fallback = "/feed"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
