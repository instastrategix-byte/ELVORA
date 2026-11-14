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
  likedByViewer: boolean;
  savedByViewer: boolean;
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
