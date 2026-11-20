/** Relationship manager vocabulary (client-safe). Mirrors 20261125000200_contact_crm.sql. */
export const CONTACT_STAGES = ["none", "warm", "active", "deal"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];
export const CONTACT_STAGE_LABELS: Record<ContactStage, string> = {
  none: "No stage",
  warm: "Warm",
  active: "Active conversation",
  deal: "Deal in progress",
};
