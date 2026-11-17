"use client";

import { ImagePlus, Lock, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { UPLOAD_RULES } from "@/lib/media";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

const CAPTION_MAX = 200;
const ACCEPT = [...UPLOAD_RULES.story_image.mime, ...UPLOAD_RULES.story_video.mime].join(",");

type Visibility = "members" | "connections";

/** Upload one photo or video, preview it, add a caption and choose who sees it. */
export function StoryComposer({ open, onOpenChange, onPosted }: { open: boolean; onOpenChange: (open: boolean) => void; onPosted: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const captionId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs when the preview changes or the composer unmounts.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function reset() {
    setFile(null);
    setPreview(null);
    setCaption("");
    setVisibility("members");
    setError(null);
  }

  function choose(f: File | undefined) {
    setError(null);
    if (!f) return;
    const isVideo = f.type.startsWith("video/");
    const rule = isVideo ? UPLOAD_RULES.story_video : UPLOAD_RULES.story_image;
    if (!(rule.mime as readonly string[]).includes(f.type)) {
      setError("Use a JPG, PNG or WebP photo, or an MP4 or WebM video.");
      return;
    }
    if (f.size > rule.maxBytes) {
      setError(`${isVideo ? "Videos" : "Photos"} must be ${Math.round(rule.maxBytes / 1024 / 1024)} MB or smaller.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const mediaType = file.type.startsWith("video/") ? "video" : "image";
      const mediaPath = await uploadFile(file, mediaType === "video" ? "story_video" : "story_image");
      await api("/api/v1/stories", { method: "POST", body: { mediaPath, mediaType, caption, visibility } });
      toast.show("Your story is live for 24 hours.", "success");
      reset();
      onOpenChange(false);
      onPosted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent title="Share a story" description="Stories disappear after 24 hours.">
        <div className="space-y-5">
          {preview && file ? (
            <div className="relative mx-auto aspect-[9/16] max-h-[52dvh] overflow-hidden rounded-2xl border border-border bg-black">
              {file.type.startsWith("video/") ? (
                <video src={preview} className="size-full object-contain" controls muted playsInline />
              ) : (
                // Local object URL preview; next/image can't optimise blob URLs.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Story preview" className="size-full object-contain" />
              )}
              {caption ? (
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10 text-sm text-white">{caption}</p>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-3 right-3"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
                disabled={busy}
              >
                Change
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-[9/16] max-h-[44dvh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-2 text-muted transition-colors hover:border-accent hover:text-fg"
            >
              <ImagePlus className="size-8" aria-hidden="true" />
              <span className="text-sm font-medium">Choose a photo or video</span>
              <span className="text-xs">Photos up to 10 MB · videos up to 50 MB</span>
            </button>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => choose(e.target.files?.[0])} />

          <Field id={captionId} label="Caption" hint={`${caption.length}/${CAPTION_MAX}`}>
            {(aria) => (
              <Textarea {...aria} rows={2} maxLength={CAPTION_MAX} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a few words (optional)" />
            )}
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Who can see this</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "members", label: "All members", icon: Users },
                  { value: "connections", label: "Connections only", icon: Lock },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    visibility === value ? "border-accent bg-surface-2 text-fg" : "border-border text-muted hover:text-fg",
                  )}
                >
                  <input type="radio" name="story-visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="sr-only" />
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!file || busy}>
              {busy ? "Posting…" : "Share story"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
