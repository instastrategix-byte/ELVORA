/**
 * How long someone must wait before another sign-in / verification / reset email can be sent.
 * Client-safe (no server imports) so the countdown and the server use the same numbers.
 *
 * The first 5 sends wait 60 s between each (Supabase also refuses a second email to the same
 * address within 60 s). After that the wait grows: 5 min, 15 min, then 1 hour per send.
 * The count resets 24 hours after the last send.
 */
export const RESEND_BASE_SECONDS = 60;
export const RESEND_FREE_ATTEMPTS = 5;
const ESCALATION_SECONDS = [5 * 60, 15 * 60, 60 * 60] as const;
export const RESEND_RESET_MS = 24 * 60 * 60 * 1000;

export type ResendPurpose = "otp" | "verify" | "reset" | "sms" | "phone_change";

/** Seconds to wait after the `sent`-th email (1-based). */
export function cooldownAfter(sent: number): number {
  if (sent <= 0) return 0;
  if (sent <= RESEND_FREE_ATTEMPTS) return RESEND_BASE_SECONDS;
  const step = Math.min(sent - RESEND_FREE_ATTEMPTS - 1, ESCALATION_SECONDS.length - 1);
  return ESCALATION_SECONDS[step] ?? 60 * 60;
}

export type ResendRecord = { n: number; last: number };

/** Seconds left before another send is allowed (0 = allowed now). */
export function secondsUntilAllowed(record: ResendRecord | undefined, now: number): number {
  if (!record || now - record.last >= RESEND_RESET_MS) return 0;
  const readyAt = record.last + cooldownAfter(record.n) * 1000;
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}

/** The record after one more send at `now`. */
export function afterSend(record: ResendRecord | undefined, now: number): ResendRecord {
  if (!record || now - record.last >= RESEND_RESET_MS) return { n: 1, last: now };
  return { n: record.n + 1, last: now };
}

/** "45s", "4:59", "1:00:00" style label for the countdown. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  if (m) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}
