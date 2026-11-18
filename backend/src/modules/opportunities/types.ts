import type { ProfileSummary } from "@backend/modules/profiles/types";
import type { OpportunityKind } from "./schemas";

export type InterestStatus = "pending" | "shortlisted" | "declined" | "withdrawn";

export type OpportunityCard = {
  id: string;
  kind: OpportunityKind;
  title: string;
  summary: string | null;
  industry: string | null;
  location: string | null;
  remote: boolean;
  visibility: "members" | "connections";
  amountMinMinor: number | null;
  amountMaxMinor: number | null;
  currency: string | null;
  status: "open" | "closed";
  /** True once the expiry date has passed (computed on the server at load time). */
  expired: boolean;
  expiresAt: string;
  createdAt: string;
  author: ProfileSummary;
  isAuthor: boolean;
  /** Only meaningful to the author (others can't read interest rows). */
  interestCount: number;
  /** The viewer's own interest, if any. */
  myInterest: InterestStatus | null;
};

export type OpportunityDetail = OpportunityCard & {
  details: string | null;
  myNote: string | null;
};

export type InterestView = {
  member: ProfileSummary;
  note: string | null;
  status: InterestStatus;
  createdAt: string;
  /** Whether the poster can message this member right now, and why not if not. */
  canMessage: boolean;
  messageBlockedReason: string | null;
};
