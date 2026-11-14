import { publicEnv } from "./env";

export type PublicBucket = "profile-media" | "listing-media";
export type PrivateBucket = "post-media" | "verification-documents";
export type Bucket = PublicBucket | PrivateBucket;

/** Public URL for objects in public buckets. Private buckets require signed URLs (server-side). */
export function publicMediaUrl(bucket: PublicBucket, path: string | null | undefined): string | null {
  const base = publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

/** Upload purposes and their storage rules. Shared by the client (pre-checks) and the server (enforcement). */
export const UPLOAD_RULES = {
  avatar: { bucket: "profile-media", maxBytes: 5 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  cover: { bucket: "profile-media", maxBytes: 5 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  post_image: { bucket: "post-media", maxBytes: 10 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  post_video: { bucket: "post-media", maxBytes: 50 * 1024 * 1024, mime: ["video/mp4", "video/webm"] },
  listing_image: { bucket: "listing-media", maxBytes: 10 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  business_logo: { bucket: "listing-media", maxBytes: 5 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"] },
  verification_document: {
    bucket: "verification-documents",
    maxBytes: 10 * 1024 * 1024,
    mime: ["image/jpeg", "image/png", "application/pdf"],
  },
} as const satisfies Record<string, { bucket: Bucket; maxBytes: number; mime: readonly string[] }>;

export type UploadPurpose = keyof typeof UPLOAD_RULES;

export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};
