import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { EXTENSION_BY_MIME, UPLOAD_RULES, type Bucket, type UploadPurpose } from "@/lib/media";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";

export const uploadRequestSchema = z.object({
  purpose: z.enum(Object.keys(UPLOAD_RULES) as [UploadPurpose, ...UploadPurpose[]]),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
  fileName: z.string().max(200),
});

export type UploadTicket = { bucket: Bucket; path: string; token: string };

/**
 * Issues a signed upload URL after validating MIME type, extension and size for the purpose.
 * The object key is generated server-side under the viewer's folder; storage RLS independently
 * enforces that users only write into their own folder and the bucket's MIME/size limits.
 */
export async function createUploadTicket(db: DbClient, viewer: Viewer, input: z.infer<typeof uploadRequestSchema>): Promise<UploadTicket> {
  const rule = UPLOAD_RULES[input.purpose];
  if (!(rule.mime as readonly string[]).includes(input.mimeType)) {
    throw new AppError("validation_failed", "This file type is not allowed.", { file: ["Unsupported file type"] });
  }
  if (input.size > rule.maxBytes) {
    throw new AppError("payload_too_large", `Files must be ${Math.round(rule.maxBytes / 1024 / 1024)} MB or smaller.`);
  }
  const ext = EXTENSION_BY_MIME[input.mimeType];
  const declaredExt = input.fileName.split(".").pop()?.toLowerCase();
  const allowedExts = ext === "jpg" ? ["jpg", "jpeg"] : [ext];
  if (!ext || !declaredExt || !allowedExts.includes(declaredExt)) {
    throw new AppError("validation_failed", "The file extension does not match its type.", { file: ["Extension mismatch"] });
  }
  const path = `${viewer.id}/${input.purpose}/${crypto.randomUUID()}.${ext}`;
  const result = unwrap(await db.storage.from(rule.bucket).createSignedUploadUrl(path));
  return { bucket: rule.bucket, path: result.path, token: result.token };
}

/** Rejects storage paths that are not inside the viewer's own folder. */
export function assertOwnedPath(viewer: Viewer, path: string): void {
  if (!path.startsWith(`${viewer.id}/`) || path.includes("..")) {
    throw new AppError("forbidden", "You can only attach your own uploads.");
  }
}

/** Signed download URLs for private objects; RLS on storage.objects decides access. */
export async function signedUrls(db: DbClient, bucket: Bucket, paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data } = await db.storage.from(bucket).createSignedUrls(paths, expiresIn);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) map.set(item.path, item.signedUrl);
  }
  return map;
}
