"use client";

import { api, ApiClientError } from "./api-client";
import { publicEnv } from "./env";
import { checkAttachment } from "@backend/modules/messaging/attachments";

export type UploadedAttachment = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
};

/** Reads image dimensions in the browser (best effort; used for layout, never trusted for security). */
async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Uploads one message attachment with progress:
 *   1. the server validates the file and returns a signed upload URL inside the conversation folder;
 *   2. the browser PUTs the file straight to Storage (so progress events are real).
 * Storage RLS and the bucket's type/size limits re-check everything independently.
 */
export function uploadAttachment(
  conversationId: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedAttachment> {
  const check = checkAttachment(file);
  if (!check.ok) return Promise.reject(new ApiClientError("validation_failed", check.error, 422));

  return (async () => {
    const ticket = await api<{ path: string; signedUrl: string; mimeType: string }>(`/api/v1/conversations/${conversationId}/attachments`, {
      method: "POST",
      body: { fileName: file.name, mimeType: check.mimeType, size: file.size },
      signal,
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", ticket.signedUrl);
      const key = publicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (key) xhr.setRequestHeader("apikey", key);
      xhr.setRequestHeader("content-type", ticket.mimeType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=3600");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(0.99, e.loaded / e.total));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new ApiClientError(xhr.status === 413 ? "payload_too_large" : "internal", xhr.status === 413 ? "That file is too large." : "Upload failed. Please try again.", xhr.status));
      xhr.onerror = () => reject(new ApiClientError("internal", "Upload failed. Check your connection and try again.", 0));
      xhr.onabort = () => reject(new ApiClientError("bad_request", "Upload cancelled.", 0));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(file);
    });
    onProgress(1);
    const dims = await imageSize(file);
    return { path: ticket.path, fileName: file.name, mimeType: ticket.mimeType, size: file.size, ...(dims ?? {}) };
  })();
}
