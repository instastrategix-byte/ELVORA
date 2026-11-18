import { z } from "zod";

/*
 * Message attachment rules, shared by the browser (pre-checks, friendly errors) and the server
 * (enforcement). The database function send_message_with_attachments and the
 * "message-attachments" bucket enforce the same list independently
 * (migration 20261120000200), so a bypassed client check can't store a disallowed file.
 */

export const ATTACHMENT_BUCKET = "message-attachments";
export const MAX_ATTACHMENTS = 10;

export type AttachmentKind = "image" | "video" | "document";

/** Allowed MIME types → canonical extension and the extensions accepted for that type. */
export const ATTACHMENT_TYPES: Record<string, { kind: AttachmentKind; ext: string; accept: readonly string[]; label: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg", accept: ["jpg", "jpeg"], label: "JPEG image" },
  "image/png": { kind: "image", ext: "png", accept: ["png"], label: "PNG image" },
  "image/webp": { kind: "image", ext: "webp", accept: ["webp"], label: "WebP image" },
  "image/gif": { kind: "image", ext: "gif", accept: ["gif"], label: "GIF image" },
  "image/heic": { kind: "image", ext: "heic", accept: ["heic"], label: "HEIC photo" },
  "image/heif": { kind: "image", ext: "heif", accept: ["heif"], label: "HEIF photo" },
  "video/mp4": { kind: "video", ext: "mp4", accept: ["mp4", "m4v"], label: "MP4 video" },
  "video/webm": { kind: "video", ext: "webm", accept: ["webm"], label: "WebM video" },
  "video/quicktime": { kind: "video", ext: "mov", accept: ["mov"], label: "QuickTime video" },
  "application/pdf": { kind: "document", ext: "pdf", accept: ["pdf"], label: "PDF" },
  "application/msword": { kind: "document", ext: "doc", accept: ["doc"], label: "Word document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", ext: "docx", accept: ["docx"], label: "Word document" },
  "application/vnd.ms-excel": { kind: "document", ext: "xls", accept: ["xls"], label: "Excel spreadsheet" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", ext: "xlsx", accept: ["xlsx"], label: "Excel spreadsheet" },
  "application/vnd.ms-powerpoint": { kind: "document", ext: "ppt", accept: ["ppt"], label: "PowerPoint" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "document", ext: "pptx", accept: ["pptx"], label: "PowerPoint" },
  "application/vnd.oasis.opendocument.text": { kind: "document", ext: "odt", accept: ["odt"], label: "OpenDocument text" },
  "application/vnd.oasis.opendocument.spreadsheet": { kind: "document", ext: "ods", accept: ["ods"], label: "OpenDocument spreadsheet" },
  "text/plain": { kind: "document", ext: "txt", accept: ["txt"], label: "Text file" },
  "text/csv": { kind: "document", ext: "csv", accept: ["csv"], label: "CSV file" },
  "application/rtf": { kind: "document", ext: "rtf", accept: ["rtf"], label: "Rich text" },
};

export const MAX_BYTES: Record<AttachmentKind, number> = {
  image: 15 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

/** Never accepted, whatever MIME type a browser claims (executables, scripts, active content). */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "cpl", "jar", "js", "mjs", "vbs", "vbe", "ps1", "psm1", "sh", "bash",
  "app", "dmg", "pkg", "apk", "ipa", "deb", "rpm", "dll", "so", "html", "htm", "xhtml", "svg", "xml", "hta", "lnk",
  "reg", "iso", "docm", "xlsm", "pptm", "dotm", "xltm",
]);

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime";
export const DOCUMENT_ACCEPT = Object.entries(ATTACHMENT_TYPES)
  .filter(([, t]) => t.kind === "document")
  .flatMap(([mime, t]) => [mime, ...t.accept.map((e) => `.${e}`)])
  .join(",");

/** Some browsers report an empty or generic MIME type; infer it from the extension when safe. */
export function resolveMimeType(fileName: string, reported: string): string {
  const mime = reported.toLowerCase();
  if (ATTACHMENT_TYPES[mime]) return mime;
  const ext = extensionOf(fileName);
  const match = Object.entries(ATTACHMENT_TYPES).find(([, t]) => t.accept.includes(ext));
  return match ? match[0] : mime;
}

export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/** Keeps a readable name but removes path separators, control characters and odd whitespace. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "attachment").slice(0, 200);
}

export type AttachmentCheck = { ok: true; mimeType: string; kind: AttachmentKind } | { ok: false; error: string };

/** Validates a file's name, type and size. Used on both the client and the server. */
export function checkAttachment(file: { name: string; type: string; size: number }): AttachmentCheck {
  const ext = extensionOf(file.name);
  if (!ext || BLOCKED_EXTENSIONS.has(ext)) return { ok: false, error: `${sanitizeFileName(file.name)}: this file type can't be shared.` };
  const mimeType = resolveMimeType(file.name, file.type);
  const type = ATTACHMENT_TYPES[mimeType];
  if (!type) return { ok: false, error: `${sanitizeFileName(file.name)}: this file type isn't supported.` };
  if (!type.accept.includes(ext)) return { ok: false, error: `${sanitizeFileName(file.name)}: the file extension doesn't match its type.` };
  if (file.size <= 0) return { ok: false, error: `${sanitizeFileName(file.name)}: the file is empty.` };
  if (file.size > MAX_BYTES[type.kind]) {
    return { ok: false, error: `${sanitizeFileName(file.name)}: ${type.kind}s must be ${Math.round(MAX_BYTES[type.kind] / 1024 / 1024)} MB or smaller.` };
  }
  return { ok: true, mimeType, kind: type.kind };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(150),
  size: z.number().int().positive(),
});

export const attachmentRefSchema = z.object({
  path: z.string().min(10).max(300),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(150),
  size: z.number().int().positive(),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
});
