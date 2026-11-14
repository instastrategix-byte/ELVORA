"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api-client";
import { UPLOAD_RULES, type UploadPurpose } from "@/lib/media";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

/**
 * Single-image picker. Validates type/size locally (UX) — the server re-validates and issues the
 * signed upload URL. Reports the resulting storage path, or null when removed.
 */
export function ImageUpload({
  purpose,
  label,
  currentUrl,
  onChange,
  shape = "rect",
}: {
  purpose: Extract<UploadPurpose, "avatar" | "cover" | "listing_image" | "business_logo">;
  label: string;
  currentUrl: string | null;
  onChange: (path: string | null) => void;
  shape?: "circle" | "rect";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const rule = UPLOAD_RULES[purpose];

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStatus("uploading");
    const local = URL.createObjectURL(file);
    setPreview(local);
    try {
      const path = await uploadFile(file, purpose);
      onChange(path);
      setStatus("idle");
    } catch (e) {
      setPreview(currentUrl);
      setStatus("error");
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-2",
            shape === "circle" ? "size-20 rounded-full" : "h-20 w-36 rounded-xl",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / storage URL
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <ImageUp className="size-6 text-muted" aria-hidden="true" />
          )}
          {status === "uploading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60">
              <Spinner label="Uploading" />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={rule.mime.join(",")}
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={status === "uploading"}>
            {preview ? "Replace" : "Upload"}
          </Button>
          {preview ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">JPEG, PNG or WebP up to {Math.round(rule.maxBytes / 1024 / 1024)} MB. Only upload images you have the right to use.</p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
