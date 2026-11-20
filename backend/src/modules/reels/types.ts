import type { ProfileSummary } from "@backend/modules/profiles/types";

/** Longest reel, in seconds (mirrors the reels.duration_s CHECK). */
export const REEL_MAX_SECONDS = 90;
export const REEL_MAX_CAPTION = 2200;
export const REEL_MAX_COMMENT = 1000;
export const REEL_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const REEL_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export type ReelView = {
  id: string;
  author: ProfileSummary;
  caption: string;
  /** Short-lived signed URL; null if it couldn't be issued. */
  videoUrl: string | null;
  posterUrl: string | null;
  durationS: number;
  width: number;
  height: number;
  visibility: "members" | "connections";
  status: "published" | "hidden" | "removed";
  likeCount: number;
  commentCount: number;
  viewCount: number;
  shareCount: number;
  likedByViewer: boolean;
  isOwn: boolean;
  createdAt: string;
};

export type ReelComment = {
  id: string;
  author: ProfileSummary;
  body: string;
  createdAt: string;
  canDelete: boolean;
};

/** Matches a link to a reel inside a message: absolute (any origin) or a bare path. */
const REEL_LINK = /(?:https?:\/\/[^\s/]+)?\/reels\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/i;

/** The id of the first reel linked in a text, if any. */
export function reelIdFromText(text: string): string | null {
  return REEL_LINK.exec(text)?.[1]?.toLowerCase() ?? null;
}

/** Compact counts for the player: 999, 1.2K, 3.4M. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Math.floor(n / 100) / 10}`.replace(/\.0$/, "") + "K";
  return `${Math.floor(n / 100_000) / 10}`.replace(/\.0$/, "") + "M";
}

/** Client-side pre-check of a picked video. The server and database re-check everything. */
export function checkReelVideo(file: { type: string; size: number }, durationS: number | null): string | null {
  if (!(REEL_VIDEO_TYPES as readonly string[]).includes(file.type)) return "Use an MP4 or WebM video.";
  if (file.size > REEL_VIDEO_MAX_BYTES) return "Videos can be up to 100 MB.";
  if (durationS === null || !Number.isFinite(durationS) || durationS <= 0) return "We couldn't read this video. Try another file.";
  if (durationS > REEL_MAX_SECONDS) return `Reels can be up to ${REEL_MAX_SECONDS} seconds long.`;
  return null;
}
