/** Vouching vocabulary. Client-safe; mirrors public.vouch_relationship (20261124000100). */
export const VOUCH_RELATIONSHIPS = ["worked_together", "invested", "client", "personal", "other"] as const;
export type VouchRelationship = (typeof VOUCH_RELATIONSHIPS)[number];

export const RELATIONSHIP_LABELS: Record<VouchRelationship, string> = {
  worked_together: "Worked together",
  invested: "Invested together",
  client: "Client or partner",
  personal: "Know personally",
  other: "Other",
};

export const VOUCH_NOTE_MAX = 280;
export const VOUCHES_PER_MONTH = 10;
export const REFEREES_PER_APPLICATION = 5;

/** "Vouched by Ana, Ben and 3 others" style summary. */
export function vouchSummary(names: string[], total: number): string {
  if (total <= 0) return "No vouches yet";
  const shown = names.slice(0, 2);
  const rest = total - shown.length;
  if (rest <= 0) return `Vouched for by ${shown.join(" and ")}`;
  return `Vouched for by ${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}
