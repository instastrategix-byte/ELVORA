"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, isDateOnly } from "@/lib/format";

const noop = () => () => {};

/** False during server render and hydration, true afterwards (and on client-side navigations). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * A timestamp in the viewer's own time zone. The server doesn't know that zone, so the server
 * render (and hydration) use UTC and the text switches to local time right after hydration —
 * no hydration mismatch, and members never see unlabelled UTC times.
 */
export function LocalTime({ iso, format = "datetime", className }: { iso: string; format?: "date" | "datetime"; className?: string }) {
  const hydrated = useHydrated();
  const tz = hydrated || isDateOnly(iso) ? undefined : "UTC";
  const text = format === "date" ? formatDate(iso, tz) : formatDateTime(iso, tz);
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
