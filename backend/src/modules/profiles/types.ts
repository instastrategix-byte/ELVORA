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
  memberType: MemberType | null;
  skills: string[];
  openTo: OpenTo[];
  achievements: string[];
  socialLinks: SocialLinks;
  experiences: Experience[];
};

export const MEMBER_TYPES = ["founder", "executive", "investor", "professional", "public_figure", "creative", "business"] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];
export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  founder: "Founder",
  executive: "Executive",
  investor: "Investor",
  professional: "Professional",
  public_figure: "Public figure",
  creative: "Creative",
  business: "Business",
};

export const OPEN_TO = ["investing", "advisory", "partnerships", "hiring", "mentoring", "speaking", "board_roles", "introductions"] as const;
export type OpenTo = (typeof OPEN_TO)[number];
export const OPEN_TO_LABELS: Record<OpenTo, string> = {
  investing: "Investing",
  advisory: "Advisory roles",
  partnerships: "Partnerships",
  hiring: "Hiring",
  mentoring: "Mentoring",
  speaking: "Speaking",
  board_roles: "Board roles",
  introductions: "Introductions",
};

export type SocialLinks = { website: string | null; linkedin: string | null; x: string | null; instagram: string | null };

export type Experience = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  startsOn: string;
  endsOn: string | null;
  description: string | null;
};

export const PRIVATE_MEMBER: Omit<ProfileSummary, "id"> = {
  handle: "",
  displayName: "Private member",
  headline: null,
  location: null,
  avatarUrl: null,
  verifiedKinds: [],
};
