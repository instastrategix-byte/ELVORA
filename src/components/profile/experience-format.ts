import type { Experience } from "@backend/modules/profiles/types";

/** "2019-04-01" -> "Apr 2019" without timezone drift. */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function experienceRange(e: Pick<Experience, "startsOn" | "endsOn">): string {
  return `${formatMonth(e.startsOn)} – ${e.endsOn ? formatMonth(e.endsOn) : "Present"}`;
}
