/**
 * Roles and permissions.
 *
 * Roles are DERIVED on the server from four independent, trusted sources — never from
 * anything the client sends:
 *   1. staff_roles table                 -> support / moderator / admin
 *   2. live subscription + plan features -> member capabilities (feature keys)
 *   3. approved identity verifications   -> verified badges
 *   4. approved businesses               -> verified business
 * The database enforces the same rules through RLS (supabase/migrations), so a bug here can
 * hide or show UI incorrectly but cannot grant access to data.
 */

export const FEATURES = [
  "feed.post",
  "connections.request",
  "messages.send",
  "discover.members",
  "discover.advanced",
  "luxury.view_members",
  "luxury.inquire",
  "business.manage",
  "listings.publish",
  "ads.manage",
] as const;
export type Feature = (typeof FEATURES)[number];

export type StaffRole = "support" | "moderator" | "admin";
export type VerificationKind = "identity" | "public_figure" | "executive";

export type Role =
  | "guest"
  | "standard_member"
  | "premium_member"
  | "verified_public_figure"
  | "verified_executive"
  | "verified_business"
  | "advertiser"
  | "support"
  | "moderator"
  | "admin";

export type Viewer = {
  id: string;
  email: string | null;
  handle: string;
  displayName: string;
  avatarPath: string | null;
  accountStatus: "active" | "suspended" | "deactivated";
  onboarded: boolean;
  features: readonly Feature[];
  staffRole: StaffRole | null;
  verifiedKinds: readonly VerificationKind[];
  hasApprovedBusiness: boolean;
};

const STAFF_RANK: Record<StaffRole, number> = { support: 1, moderator: 2, admin: 3 };

export function isStaff(viewer: Viewer | null, min: StaffRole = "support"): boolean {
  return Boolean(viewer?.staffRole && STAFF_RANK[viewer.staffRole] >= STAFF_RANK[min]);
}

export function hasFeature(viewer: Viewer | null, feature: Feature): boolean {
  return Boolean(viewer && viewer.accountStatus === "active" && viewer.features.includes(feature));
}

export function deriveRoles(viewer: Viewer | null): Role[] {
  if (!viewer) return ["guest"];
  const roles: Role[] = [];
  if (viewer.accountStatus === "active" && viewer.onboarded) roles.push("standard_member");
  if (hasFeature(viewer, "luxury.inquire")) roles.push("premium_member");
  if (viewer.verifiedKinds.includes("public_figure")) roles.push("verified_public_figure");
  if (viewer.verifiedKinds.includes("executive")) roles.push("verified_executive");
  if (viewer.hasApprovedBusiness) roles.push("verified_business");
  if (hasFeature(viewer, "ads.manage")) roles.push("advertiser");
  if (viewer.staffRole) roles.push(viewer.staffRole);
  return roles;
}

/** Human-readable badge labels for approved verifications. */
export const VERIFICATION_LABELS: Record<VerificationKind, string> = {
  identity: "Identity verified",
  public_figure: "Verified public figure",
  executive: "Verified executive",
};

export function parseFeatures(values: readonly string[] | null | undefined): Feature[] {
  const known = new Set<string>(FEATURES);
  return (values ?? []).filter((v): v is Feature => known.has(v));
}
