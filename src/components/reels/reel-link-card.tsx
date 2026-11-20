"use client";

import { Clapperboard, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ReelView } from "@backend/modules/reels/types";

/** A reel shared in a message. Shows "unavailable" when the viewer isn't allowed to see it. */
export function ReelLinkCard({ reelId, own }: { reelId: string; own: boolean }) {
  const [state, setState] = useState<{ reel: ReelView } | "loading" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    api<ReelView>(`/api/v1/reels/${reelId}`)
      .then((reel) => !cancelled && setState({ reel }))
      .catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [reelId]);

  const frame = cn("block w-40 overflow-hidden rounded-2xl border border-border bg-surface-2", own ? "self-end" : "self-start");
  if (state === "loading") return <div className={cn(frame, "aspect-[9/16] animate-pulse")} aria-label="Loading reel" />;
  if (state === "unavailable") {
    return (
      <p className={cn(frame, "flex items-center gap-2 p-3 text-xs text-muted")}>
        <Clapperboard className="size-4 shrink-0" aria-hidden="true" /> This reel isn&apos;t available to you.
      </p>
    );
  }
  const { reel } = state;
  return (
    <Link href={`/reels/${reel.id}`} className={cn(frame, "group relative aspect-[9/16]")} aria-label={`Watch reel by ${reel.author.displayName}`}>
      {reel.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
        <img src={reel.posterUrl} alt="" className="size-full object-cover" />
      ) : (
        <Clapperboard className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 pt-8 text-xs font-medium text-white">
        {reel.author.displayName}
      </span>
      <span className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white">
        <Play className="size-3.5 fill-white" aria-hidden="true" />
      </span>
    </Link>
  );
}
