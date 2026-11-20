"use client";

import { api, ApiClientError } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { AD_MEDIA_BUCKET, AD_MEDIA_TYPES } from "@backend/modules/advertising/constants";
import { checkAdMedia } from "./model";

export type UploadedMedia = { path: string; kind: "image" | "video"; width: number | null; height: number | null; durationS: number | null; previewUrl: string };

function readImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("unreadable"));
    img.src = url;
  });
}

function readVideo(url: string): Promise<{ width: number; height: number; durationS: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, durationS: v.duration });
    v.onerror = () => reject(new Error("unreadable"));
    v.src = url;
  });
}

/**
 * Uploads one creative file to the private ad-media bucket: measure it in the browser, check the
 * limits, get a signed upload URL (the server re-validates type, size, dimensions and duration),
 * then upload straight to Storage. Returns the stored path plus a local preview URL.
 */
export async function uploadAdMedia(file: File, accountId: string): Promise<UploadedMedia> {
  const type = AD_MEDIA_TYPES[file.type as keyof typeof AD_MEDIA_TYPES];
  const early = checkAdMedia({ mimeType: file.type, size: file.size });
  if (early || !type) throw new ApiClientError("validation_failed", early ?? "Unsupported file type.", 422);

  const previewUrl = URL.createObjectURL(file);
  let dims: { width: number; height: number; durationS?: number };
  try {
    dims = type.kind === "image" ? await readImage(previewUrl) : await readVideo(previewUrl);
  } catch {
    URL.revokeObjectURL(previewUrl);
    throw new ApiClientError("validation_failed", "We couldn't read this file. Try exporting it again.", 422);
  }
  const problem = checkAdMedia({ mimeType: file.type, size: file.size, ...dims });
  if (problem) {
    URL.revokeObjectURL(previewUrl);
    throw new ApiClientError("validation_failed", problem, 422);
  }

  const durationS = dims.durationS && Number.isFinite(dims.durationS) ? Math.round(dims.durationS * 10) / 10 : undefined;
  const ticket = await api<{ path: string; token: string; kind: "image" | "video" }>("/api/v1/ads-manager/creatives/upload-url", {
    method: "POST",
    body: { accountId, fileName: file.name.slice(0, 200), mimeType: file.type, size: file.size, width: dims.width, height: dims.height, durationS },
  });
  const { error } = await createClient().storage.from(AD_MEDIA_BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
  if (error) {
    URL.revokeObjectURL(previewUrl);
    throw new ApiClientError("internal", "Upload failed. Please try again.", 500);
  }
  return { path: ticket.path, kind: ticket.kind, width: dims.width, height: dims.height, durationS: durationS ?? null, previewUrl };
}
