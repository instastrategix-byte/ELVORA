/** Deal room vocabulary shared by the API and the browser. Mirrors 20261125000100_deal_rooms.sql. */

export const DEAL_ROOM_BUCKET = "deal-room-files";
export const DEAL_ROOM_MAX_BYTES = 50 * 1024 * 1024;

export const DEAL_ROOM_FILE_TYPES: Record<string, { ext: string; label: string }> = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "application/msword": { ext: "doc", label: "Word" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word" },
  "application/vnd.ms-excel": { ext: "xls", label: "Excel" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel" },
  "application/vnd.ms-powerpoint": { ext: "ppt", label: "PowerPoint" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint" },
  "image/jpeg": { ext: "jpg", label: "Image" },
  "image/png": { ext: "png", label: "Image" },
  "image/webp": { ext: "webp", label: "Image" },
};

export const DEAL_ROOM_ACCEPT = Object.keys(DEAL_ROOM_FILE_TYPES).join(",");

export const DEAL_ROOM_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type DealRoomRole = (typeof DEAL_ROOM_ROLES)[number];
export const DEAL_ROOM_ROLE_LABELS: Record<DealRoomRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer (read-only)",
};

export type DealRoomStatus = "open" | "closed" | "archived";

/** Checks a file before requesting an upload URL. The database re-checks against the stored object. */
export function checkDealRoomFile(file: { type: string; size: number }): { ok: true } | { ok: false; error: string } {
  if (!DEAL_ROOM_FILE_TYPES[file.type]) return { ok: false, error: "Use PDF, Word, Excel, PowerPoint, JPEG, PNG or WebP files." };
  if (file.size <= 0) return { ok: false, error: "This file is empty." };
  if (file.size > DEAL_ROOM_MAX_BYTES) return { ok: false, error: "Files can be up to 50 MB." };
  return { ok: true };
}
