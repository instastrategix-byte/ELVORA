"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { formatWait, RESEND_FREE_ATTEMPTS } from "@backend/modules/auth/resend-policy";

/**
 * Seconds left until `retryAt` (epoch ms), ticking down. 0 when there's nothing to wait for;
 * null while the clock hasn't been read yet (prerender / first paint) — treat that as "waiting".
 */
export function useRetryCountdown(retryAt?: number): number | null {
  // The clock is only read in the browser (never during prerender).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= retryAt) clearInterval(timer);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [retryAt]);
  if (!retryAt) return 0;
  if (now === null) return null;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

/**
 * Submit button for "send the email again". Disabled with a live countdown while the cooldown
 * runs; the server enforces the same wait, so this is a convenience, not the protection.
 */
export function ResendButton({
  retryAt,
  sent,
  pending,
  label,
  pendingLabel = "Sending…",
  ...props
}: Omit<ButtonProps, "children" | "type"> & { retryAt?: number; sent?: number; pending: boolean; label: string; pendingLabel?: string }) {
  const left = useRetryCountdown(retryAt);
  const waiting = left === null || left > 0;
  return (
    <div className="space-y-2">
      <Button type="submit" disabled={pending || waiting} aria-disabled={pending || waiting} {...props}>
        {pending ? (
          pendingLabel
        ) : waiting ? (
          <span>
            {label}
            {left ? (
              <>
                {" "}
                in <span className="tabular-nums">{formatWait(left)}</span>
              </>
            ) : null}
          </span>
        ) : (
          label
        )}
      </Button>
      {waiting && ((sent ?? 0) >= RESEND_FREE_ATTEMPTS || (left ?? 0) > 60) ? (
        <p className="text-center text-xs text-muted">For your security, the wait gets longer after {RESEND_FREE_ATTEMPTS} emails. Check your spam folder too.</p>
      ) : null}
      {/* Announce only when it becomes available again, not every second. */}
      <p className="sr-only" aria-live="polite">
        {retryAt && !waiting ? "You can request another email now." : ""}
      </p>
    </div>
  );
}
