import type { ProfileSummary } from "@backend/modules/profiles/types";

export type CommunityVisibility = "open" | "private";
export type CommunityRole = "owner" | "moderator" | "member";
export type CommunityMemberStatus = "active" | "pending" | "banned";

export type CommunityCard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: CommunityVisibility;
  coverUrl: string | null;
  memberCount: number;
  archived: boolean;
  createdAt: string;
  /** The viewer's own membership, if any (pending and banned included). */
  myRole: CommunityRole | null;
  myStatus: CommunityMemberStatus | null;
};

export type CommunityDetail = CommunityCard & {
  coverPath: string | null;
  createdBy: ProfileSummary;
  /** Threads are readable (open community, or approved member). */
  canRead: boolean;
  canPost: boolean;
  canModerate: boolean;
  isOwner: boolean;
};

export type ThreadSummary = {
  id: string;
  communityId: string;
  title: string;
  excerpt: string;
  author: ProfileSummary;
  pinned: boolean;
  locked: boolean;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
  isOwn: boolean;
};

export type ThreadDetail = ThreadSummary & { body: string; updatedAt: string };

export type ReplyView = {
  id: string;
  threadId: string;
  author: ProfileSummary;
  body: string;
  createdAt: string;
  isOwn: boolean;
};

export type CommunityMemberView = {
  profile: ProfileSummary;
  role: CommunityRole;
  status: CommunityMemberStatus;
  joinedAt: string;
};
