import type { ProfileSummary } from "@backend/modules/profiles/types";

export type PostMedia = { id: string; type: "image" | "video"; url: string | null; alt: string | null };

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
