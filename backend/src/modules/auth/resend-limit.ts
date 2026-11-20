import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { afterSend, RESEND_RESET_MS, secondsUntilAllowed, type ResendPurpose, type ResendRecord } from "./resend-policy";

/**
 * Server-side enforcement of the resend cooldown (see resend-policy.ts), kept per browser in an
 * HttpOnly cookie so it survives reloads and serverless instance changes.
 *
 * Deliberately NOT tracked per email address on the server: that would let anyone lock a real
 * member out of their own sign-in emails by requesting codes for their address. Supabase's own
 * per-address email limits remain the backstop against someone clearing cookies.
 * Addresses are stored only as truncated hashes.
 */
const COOKIE = "elv_resend";
const MAX_ENTRIES = 10;

function keyFor(purpose: ResendPurpose, email: string) {
  return createHash("sha256").update(`${purpose}:${email.trim().toLowerCase()}`).digest("hex").slice(0, 20);
}

type Store = Record<string, ResendRecord>;

async function readCookie(): Promise<Store> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && Number.isInteger(v[0]) && Number.isFinite(v[1])) out[k] = { n: v[0] as number, last: v[1] as number };
    }
    return out;
  } catch {
    return {};
  }
}

/** Seconds left before another email for this purpose/address may be sent from this browser (0 = now). */
export async function resendWait(purpose: ResendPurpose, email: string, now = Date.now()): Promise<number> {
  return secondsUntilAllowed((await readCookie())[keyFor(purpose, email)], now);
}

/** When another email may be sent from this browser, as epoch ms; undefined when allowed now. */
export async function resendRetryAt(purpose: ResendPurpose, email: string, now = Date.now()): Promise<number | undefined> {
  const wait = await resendWait(purpose, email, now);
  return wait > 0 ? now + wait * 1000 : undefined;
}

/** Records a send and returns the seconds until the next one is allowed. Call only from Server Actions. */
export async function recordResend(purpose: ResendPurpose, email: string, now = Date.now()): Promise<{ wait: number; sent: number }> {
  const key = keyFor(purpose, email);
  const store = await readCookie();
  const next = afterSend(store[key], now);
  store[key] = next;
  const kept = Object.entries(store)
    .filter(([, r]) => now - r.last < RESEND_RESET_MS)
    .sort((a, b) => b[1].last - a[1].last)
    .slice(0, MAX_ENTRIES);
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(Object.fromEntries(kept.map(([k, r]) => [k, [r.n, r.last]])))).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RESEND_RESET_MS / 1000,
  });
  return { wait: secondsUntilAllowed(next, now), sent: next.n };
}
