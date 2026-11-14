import type { VerificationKind } from "@backend/modules/auth/permissions";

export type ProfileSummary = {
  id: string;
  handle: string;
  displayName: string;
  headline: string | null;
  location: string | null;
  avatarUrl: string | null;
  verifiedKinds: VerificationKind[];
};

export type Relationship = {
  connection: { id: string; status: "pending" | "accepted"; direction: "outgoing" | "incoming" } | null;
  following: boolean;
  blocked: boolean;
  canMessage: boolean;
};

export type ProfileDetail = ProfileSummary & {
  bio: string | null;
  jobTitle: string | null;
  company: string | null;
  industry: string | null;
  website: string | null;
  interests: string[];
  coverUrl: string | null;
  profileVisibility: "public" | "members" | "connections";
  memberSince: string;
  hasApprovedBusiness: boolean;
};

export const PRIVATE_MEMBER: Omit<ProfileSummary, "id"> = {
  handle: "",
  displayName: "Private member",
  headline: null,
  location: null,
  avatarUrl: null,
  verifiedKinds: [],
};
