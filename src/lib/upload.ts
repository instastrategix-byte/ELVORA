"use client";

import { api, ApiClientError } from "./api-client";
import { UPLOAD_RULES, type UploadPurpose } from "./media";
import { createClient } from "./supabase/client";

/**
 * Uploads one file: the server validates it and issues a signed upload URL under the user's
 * folder, then the browser uploads directly to Storage. Returns the storage path.
 */
export async function uploadFile(file: File, purpose: UploadPurpose): Promise<string> {
  const rule = UPLOAD_RULES[purpose];
  if (!(rule.mime as readonly string[]).includes(file.type)) {
    throw new ApiClientError("validation_failed", "This file type is not supported.", 422);
  }
  if (file.size > rule.maxBytes) {
    throw new ApiClientError("payload_too_large", `Files must be ${Math.round(rule.maxBytes / 1024 / 1024)} MB or smaller.`, 413);
  }
  const ticket = await api<{ bucket: string; path: string; token: string }>("/api/v1/uploads", {
    method: "POST",
    body: { purpose, mimeType: file.type, size: file.size, fileName: file.name },
  });
  const { error } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
    contentType: file.type,
  });
  if (error) throw new ApiClientError("internal", "Upload failed. Please try again.", 500);
  return ticket.path;
}
