"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PostMedia } from "@backend/modules/feed/types";

/**
 * Post media in an adaptive grid (1 / 2 / 3 / 4+ layouts) with a full-screen viewer.
 * Images open the viewer; videos play inline.
 */
export function MediaGallery({ media }: { media: PostMedia[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  const n = shown.length;

  return (
    <>
      <div
        className={cn(
          "grid gap-1 overflow-hidden rounded-xl border border-border",
          n === 2 && "grid-cols-2",
          n === 3 && "grid-cols-2 grid-rows-2",
          n >= 4 && "grid-cols-2",
        )}
      >
        {shown.map((m, i) => {
          const tile = cn(
            "relative w-full overflow-hidden bg-surface-2",
            n === 1 ? "max-h-[560px]" : "aspect-square",
            n === 3 && i === 0 && "row-span-2 aspect-auto h-full",
          );
          if (!m.url) {
            return (
              <div key={m.id} className={cn(tile, "flex min-h-40 items-center justify-center text-xs text-muted")}>
                Media unavailable
              </div>
            );
          }
          if (m.type === "video") {
            return (
              <video
                key={m.id}
                src={m.url}
                controls
                playsInline
                preload="metadata"
                className={cn(tile, "bg-black object-contain", n === 1 && "aspect-video")}
                aria-label={m.alt ?? "Video"}
              />
            );
          }
          return (
            <button key={m.id} type="button" onClick={() => setOpen(i)} className={cn(tile, "group cursor-zoom-in")} aria-label={`Open image ${i + 1} of ${media.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs from private storage */}
              <img src={m.url} alt={m.alt ?? ""} loading="lazy" className={cn("size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]", n === 1 && "max-h-[560px]")} />
              {i === 3 && extra > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-medium text-white">+{extra}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {open !== null ? <Lightbox media={media} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({ media, index, onIndex, onClose }: { media: PostMedia[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const images = media.map((m, i) => ({ ...m, i })).filter((m) => m.type === "image" && m.url);
  const pos = Math.max(0, images.findIndex((m) => m.i === index));
  const current = images[pos];
  const go = useCallback((d: number) => {
    const next = images[(pos + d + images.length) % images.length];
    if (next) onIndex(next.i);
  }, [images, pos, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!current) return null;
  return (
    <D.Root open onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/92 data-[state=open]:animate-fade-in" />
        <D.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none data-[state=open]:animate-scale-in sm:p-10">
          <D.Title className="sr-only">
            Image {pos + 1} of {images.length}
          </D.Title>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
          <img src={current.url!} alt={current.alt ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
          {current.alt ? <p className="absolute inset-x-0 bottom-6 mx-auto max-w-xl px-6 text-center text-sm text-white/80">{current.alt}</p> : null}
          <D.Close className="absolute top-4 right-4 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" aria-label="Close">
            <X className="size-5" />
          </D.Close>
          {images.length > 1 ? (
            <>
              <button type="button" onClick={() => go(-1)} className="absolute left-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" aria-label="Previous image">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => go(1)} className="absolute right-3 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" aria-label="Next image">
                <ChevronRight className="size-5" />
              </button>
              <p className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
                {pos + 1} / {images.length}
              </p>
            </>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
