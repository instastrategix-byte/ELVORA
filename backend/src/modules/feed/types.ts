import type { ProfileSummary } from "@backend/modules/profiles/types";

export type PostMedia = { id: string; type: "image" | "video"; url: string | null; alt: string | null };

export type PostPoll = {
  question: string | null;
  options: { id: string; label: string; votes: number; voted: boolean }[];
  /** Total choices cast (a member picking several options in a multi-choice poll counts each). */
  totalVotes: number;
  closesAt: string;
  closed: boolean;
  allowMultiple: boolean;
};

export type PostView = {
  id: string;
  author: ProfileSummary;
  body: string;
  visibility: "public" | "members" | "connections";
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  repostedByViewer: boolean;
  /** Set when the post is in the viewer's feed because someone in their network reposted it. */
  repostedBy?: ProfileSummary | null;
  isOwn: boolean;
  media: PostMedia[];
  poll?: PostPoll | null;
};

export type CommentView = {
  id: string;
  postId: string;
  author: ProfileSummary;
  body: string;
  createdAt: string;
  canDelete: boolean;
};

export type TrendingTag = { tag: string; postCount: number };
