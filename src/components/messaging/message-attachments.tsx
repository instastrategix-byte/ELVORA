"use client";

import { Download, ExternalLink, FileSpreadsheet, FileText, FileType2, Presentation } from "lucide-react";
import { MediaGallery } from "@/components/feed/media-gallery";
import { cn } from "@/lib/utils";
import { ATTACHMENT_TYPES, formatBytes } from "@backend/modules/messaging/attachments";
import type { MessageAttachment } from "@backend/modules/messaging/types";

function docIcon(mime: string) {
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return { Icon: FileSpreadsheet, tone: "text-emerald-500" };
  if (mime.includes("presentation") || mime.includes("powerpoint")) return { Icon: Presentation, tone: "text-orange-500" };
  if (mime === "application/pdf") return { Icon: FileType2, tone: "text-rose-500" };
  if (mime.includes("word") || mime.includes("opendocument.text") || mime === "application/rtf") return { Icon: FileText, tone: "text-sky-500" };
  return { Icon: FileText, tone: "text-muted" };
}

/** Photos/videos as a gallery (with full-screen viewer) and documents as cards with Open / Download. */
export function MessageAttachments({ attachments, own }: { attachments: MessageAttachment[]; own: boolean }) {
  const media = attachments.filter((a) => a.kind !== "document");
  const docs = attachments.filter((a) => a.kind === "document");
  return (
    <div className={cn("flex w-full flex-col gap-2", own ? "items-end" : "items-start")}>
      {media.length ? (
        <div className="w-72 max-w-full sm:w-80">
          <MediaGallery
            media={media.map((m) => ({ id: m.id, type: m.kind === "video" ? "video" : "image", url: m.url, alt: m.fileName }))}
          />
        </div>
      ) : null}
      {docs.map((d) => {
        const { Icon, tone } = docIcon(d.mimeType);
        const label = ATTACHMENT_TYPES[d.mimeType]?.label ?? "Document";
        return (
          <div key={d.id} className="flex w-72 max-w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3 sm:w-80">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
              <Icon className={cn("size-5", tone)} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={d.fileName}>
                {d.fileName}
              </span>
              <span className="block text-xs text-muted">
                {label} · {formatBytes(d.sizeBytes)}
              </span>
            </span>
            {d.downloadUrl ? (
              <span className="flex shrink-0 gap-1">
                <a
                  href={d.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-fg"
                  aria-label={`Open ${d.fileName}`}
                  title={d.mimeType === "application/pdf" ? "Preview" : "Open"}
                >
                  <ExternalLink className="size-4" />
                </a>
                <a
                  href={`${d.downloadUrl}?download=1`}
                  className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-fg"
                  aria-label={`Download ${d.fileName}`}
                  title="Download"
                >
                  <Download className="size-4" />
                </a>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
