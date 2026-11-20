"use client";

import { Clapperboard, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload";
import { checkReelVideo, REEL_MAX_CAPTION, REEL_MAX_SECONDS, type ReelView } from "@backend/modules/reels/types";

type Picked = { file: File; url: string; durationS: number; width: number; height: number; poster: File | null };

/** Reads a video's duration and size, and grabs a frame as the cover image. */
async function inspectVideo(file: File): Promise<Picked> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("unreadable"));
  }).catch(() => {
    URL.revokeObjectURL(url);
    throw new Error("We couldn't read this video. Try an MP4 file.");
  });
  const durationS = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;
  let poster: File | null = null;
  try {
    video.currentTime = Math.min(1, durationS / 3);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    const scale = Math.min(1, 720 / Math.max(width, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (blob) poster = new File([blob], "cover.jpg", { type: "image/jpeg" });
  } catch {
    // The reel still works without a cover; the player shows the first frame.
  }
  return { file, url, durationS, width, height, poster };
}

export function ReelUploader() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"members" | "connections">("members");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "uploading" | "publishing">("idle");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => () => (picked ? URL.revokeObjectURL(picked.url) : undefined), [picked]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const typeError = checkReelVideo(file, 1);
    if (typeError) return setError(typeError);
    setStage("reading");
    try {
      const result = await inspectVideo(file);
      const problem = checkReelVideo(file, result.durationS);
      if (problem) {
        URL.revokeObjectURL(result.url);
        setError(problem);
      } else {
        setPicked(result);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage("idle");
    }
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || stage !== "idle") return;
    setError(null);
    try {
      setStage("uploading");
      const [videoPath, posterPath] = await Promise.all([
        uploadFile(picked.file, "reel_video"),
        picked.poster ? uploadFile(picked.poster, "reel_poster").catch(() => null) : Promise.resolve(null),
      ]);
      setStage("publishing");
      const reel = await api<ReelView>("/api/v1/reels", {
        method: "POST",
        body: {
          caption: caption.trim(),
          videoPath,
          posterPath,
          durationS: Math.round(picked.durationS * 100) / 100,
          width: picked.width,
          height: picked.height,
          visibility,
        },
      });
      router.push(`/reels/${reel.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setStage("idle");
    }
  }

  const busy = stage !== "idle";
  return (
    <form onSubmit={publish} className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]" noValidate>
      <div>
        {picked ? (
          <div className="relative aspect-[9/16] overflow-hidden rounded-3xl bg-black">
            <video src={picked.url} controls playsInline muted className="size-full object-contain" aria-label="Preview of your reel" />
            {!busy ? (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="absolute top-3 right-3 rounded-full bg-black/55 p-2 text-white hover:bg-black/70"
                aria-label="Choose a different video"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border-strong bg-surface p-6 text-center hover:border-accent"
          >
            <Clapperboard className="size-10 text-accent" aria-hidden="true" />
            <span className="font-medium">{stage === "reading" ? "Reading video…" : "Choose a video"}</span>
            <span className="text-xs text-muted">MP4 or WebM, up to {REEL_MAX_SECONDS} seconds and 100 MB. Vertical (9:16) looks best.</span>
          </button>
        )}
        <input ref={input} type="file" accept="video/mp4,video/webm" onChange={onPick} className="sr-only" tabIndex={-1} aria-hidden="true" />
      </div>

      <div className="space-y-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field id="reel-caption" label="Caption" hint={`${caption.length}/${REEL_MAX_CAPTION}`}>
          {(a) => (
            <Textarea
              {...a}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={REEL_MAX_CAPTION}
              rows={5}
              placeholder="Say something about your reel."
            />
          )}
        </Field>
        <Field id="reel-visibility" label="Who can watch">
          {(a) => (
            <Select {...a} value={visibility} onChange={(e) => setVisibility(e.target.value as "members" | "connections")}>
              <option value="members">All members</option>
              <option value="connections">Connections only</option>
            </Select>
          )}
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!picked || busy}>
            <Upload /> {stage === "uploading" ? "Uploading video…" : stage === "publishing" ? "Publishing…" : "Share reel"}
          </Button>
          {!picked ? (
            <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
              Choose video
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">Reels are visible to signed-in members only. You can delete a reel at any time.</p>
      </div>
    </form>
  );
}
