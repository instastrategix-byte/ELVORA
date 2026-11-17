import type { ProfileSummary } from "@backend/modules/profiles/types";

export type StoryMediaType = "image" | "video";
export type StoryVisibility = "members" | "connections";

export type StoryView = {
  id: string;
  /** Short-lived signed URL (private bucket); null if the object could not be signed. */
  mediaUrl: string | null;
  mediaType: StoryMediaType;
  caption: string | null;
  visibility: StoryVisibility;
  createdAt: string;
  expiresAt: string;
  /** Whether the viewer has already seen it (always true for the viewer's own stories). */
  seen: boolean;
  isOwn: boolean;
  /** Number of members who viewed it — only present on the viewer's own stories. */
  viewCount?: number;
};

export type StoryAuthorGroup = {
  author: ProfileSummary;
  stories: StoryView[];
  hasUnseen: boolean;
  isOwn: boolean;
};

export type StoryViewer = { profile: ProfileSummary; viewedAt: string };
