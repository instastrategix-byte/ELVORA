"use client";

import { AlertCircle, Camera, FileText, ImagePlus, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { uploadAttachment, type UploadedAttachment } from "@/lib/attachment-upload";
import { errorMessage } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_BUCKET,
  checkAttachment,
  DOCUMENT_ACCEPT,
  formatBytes,
  IMAGE_ACCEPT,
  MAX_ATTACHMENTS,
  type AttachmentKind,
} from "@backend/modules/messaging/attachments";
import { MESSAGE_MAX_LENGTH } from "@backend/modules/messaging/schemas";
import { CameraCapture } from "./camera-capture";

export type PendingAttachment = {
  key: string;
  file: File;
  kind: AttachmentKind;
  previewUrl: string | null;
  status: "uploading" | "ready" | "failed";
  progress: number;
  error?: string;
  uploaded?: UploadedAttachment;
  controller: AbortController;
};

export type ComposerSendInput = {
  body: string;
  attachments: UploadedAttachment[];
  /** Local previews for the optimistic bubble (object URLs owned by the caller after send). */
  previews: { fileName: string; kind: AttachmentKind; mimeType: string; size: number; previewUrl: string | null }[];
};

/**
 * Message composer: text (autosizing, Enter to send), emoji, photos/videos, documents and camera.
 * Files upload as soon as they're added (with progress), can be removed before sending, and the
 * Send button waits until every upload has finished.
 */
export function Composer({
  conversationId,
  placeholder,
  onSend,
  onTyping,
  emojiPicker: EmojiPicker,
}: {
  conversationId: string;
  placeholder: string;
  onSend: (input: ComposerSendInput) => void;
  onTyping?: () => void;
  /** Optional emoji picker component; its onSelect inserts the chosen emoji at the cursor. */
  emojiPicker?: ComponentType<{ onSelect: (emoji: string) => void; className?: string }>;
}) {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Abort in-flight uploads and free previews if the composer unmounts.
  useEffect(
    () => () => {
      for (const i of itemsRef.current) {
        i.controller.abort();
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
      }
    },
    [],
  );

  const autosize = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(autosize, [draft, autosize]);

  const update = (key: string, patch: Partial<PendingAttachment>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function startUpload(item: PendingAttachment) {
    uploadAttachment(conversationId, item.file, (progress) => update(item.key, { progress }), item.controller.signal)
      .then((uploaded) => update(item.key, { status: "ready", progress: 1, uploaded }))
      .catch((e) => {
        if (item.controller.signal.aborted) return;
        update(item.key, { status: "failed", error: errorMessage(e) });
      });
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const files = Array.from(list);
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    const problems: string[] = [];
    if (files.length > room) problems.push(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
    const added: PendingAttachment[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const check = checkAttachment(file);
      if (!check.ok) {
        problems.push(check.error);
        continue;
      }
      added.push({
        key: crypto.randomUUID(),
        file,
        kind: check.kind,
        previewUrl: check.kind === "document" ? null : URL.createObjectURL(file),
        status: "uploading",
        progress: 0,
        controller: new AbortController(),
      });
    }
    setNotice(problems.length ? problems.join(" ") : null);
    if (added.length) {
      setItems((prev) => [...prev, ...added]);
      added.forEach(startUpload);
    }
  }

  function remove(key: string) {
    const item = itemsRef.current.find((i) => i.key === key);
    if (!item) return;
    item.controller.abort();
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    // Uploaded but never sent: delete it (storage RLS allows this only until it's attached to a message).
    if (item.uploaded) void createClient().storage.from(ATTACHMENT_BUCKET).remove([item.uploaded.path]).catch(() => undefined);
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function retry(key: string) {
    const item = itemsRef.current.find((i) => i.key === key);
    if (!item) return;
    const fresh = { ...item, status: "uploading" as const, progress: 0, error: undefined, controller: new AbortController() };
    update(key, fresh);
    startUpload(fresh);
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MESSAGE_MAX_LENGTH);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(start + emoji.length, next.length);
      el?.setSelectionRange(pos, pos);
    });
  }

  const uploading = items.some((i) => i.status === "uploading");
  const failed = items.some((i) => i.status === "failed");
  const canSend = !uploading && !failed && (draft.trim().length > 0 || items.length > 0);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    const ready = items.filter((i) => i.uploaded);
    onSend({
      body: draft.trim(),
      attachments: ready.map((i) => i.uploaded!),
      previews: ready.map((i) => ({ fileName: i.file.name, kind: i.kind, mimeType: i.uploaded!.mimeType, size: i.file.size, previewUrl: i.previewUrl })),
    });
    setDraft("");
    setItems([]); // preview URLs now belong to the optimistic message
    setNotice(null);
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-border bg-surface/60 p-2 sm:p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          addFiles(files);
        }
      }}
    >
      {items.length ? (
        <ul className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Attachments to send">
          {items.map((i) => (
            <li key={i.key} className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
              {i.kind === "image" && i.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={i.previewUrl} alt="" className="size-full object-cover" />
              ) : i.kind === "video" && i.previewUrl ? (
                <video src={i.previewUrl} muted className="size-full object-cover" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 px-1 text-center">
                  <FileText className="size-5 text-accent" aria-hidden="true" />
                  <span className="line-clamp-2 text-[10px] leading-tight break-all">{i.file.name}</span>
                </span>
              )}
              <span className="sr-only">
                {i.file.name}, {formatBytes(i.file.size)},{" "}
                {i.status === "uploading" ? `uploading ${Math.round(i.progress * 100)}%` : i.status === "failed" ? `failed: ${i.error}` : "ready"}
              </span>
              {i.status === "uploading" ? (
                <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/40" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(4, i.progress * 100)}%` }} />
                </span>
              ) : null}
              {i.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => retry(i.key)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-[10px] text-white"
                  title={i.error}
                  aria-label={`Retry upload of ${i.file.name}`}
                >
                  <RotateCcw className="size-4" /> Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(i.key)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                aria-label={`Remove ${i.file.name}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p role="alert" className="mb-2 flex items-start gap-1.5 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> {notice}
        </p>
      ) : null}

      <div className="flex items-end gap-1">
        <input ref={mediaInput} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <input ref={docInput} type="file" accept={DOCUMENT_ACCEPT} multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <div className="flex shrink-0 items-center">
          <ComposerIcon label="Attach a document" onClick={() => docInput.current?.click()}>
            <Paperclip />
          </ComposerIcon>
          <ComposerIcon label="Add photos or videos" onClick={() => mediaInput.current?.click()}>
            <ImagePlus />
          </ComposerIcon>
          <ComposerIcon label="Take a photo" onClick={() => setCameraOpen(true)}>
            <Camera />
          </ComposerIcon>
        </div>
        <div className="relative flex min-w-0 flex-1 items-end rounded-2xl border border-border bg-surface focus-within:border-accent">
          <label htmlFor="message-input" className="sr-only">
            {placeholder}
          </label>
          <textarea
            id="message-input"
            ref={textRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={1}
            placeholder={placeholder}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-[15px] leading-6 placeholder:text-muted/70 focus:outline-none"
          />
          {EmojiPicker ? (
            <div className="shrink-0 p-1">
              <EmojiPicker onSelect={insertEmoji} />
            </div>
          ) : null}
        </div>
        <Button type="submit" size="icon" disabled={!canSend} aria-label={uploading ? "Waiting for uploads" : "Send message"} className="shrink-0">
          <Send />
        </Button>
      </div>

      <CameraCapture open={cameraOpen} onOpenChange={setCameraOpen} onCapture={(file) => addFiles([file])} />
    </form>
  );
}

function ComposerIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("pressable inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-accent [&_svg]:size-5")}
    >
      {children}
    </button>
  );
}
