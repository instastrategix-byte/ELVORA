"use client";

import { ArrowUpRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { safeNextPath } from "@/lib/routes";
import { isSafeDestination } from "@/lib/safe-url";
import { CTA_LABELS } from "@backend/modules/advertising/constants";
import type { SponsoredAd } from "@backend/modules/advertising/types";

/**
 * A clearly labelled sponsored placement. The server decides eligibility (approval, schedule,
 * budgets, balance, frequency cap, targeting) and records the impression when serving.
 * Renders nothing when no ad is eligible or the service is unavailable.
 */
export function SponsoredSlot({ placement }: { placement: "feed" | "luxury" | "discover" | "marketplace" | "events" | "business" | "recommendations" }) {
  const [item, setItem] = useState<SponsoredAd | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<SponsoredAd[]>(`/api/v1/ads/serve-v2?placement=${placement}`, { signal: controller.signal })
      .then((items) => setItem(items[0] ?? null))
      .catch(() => setItem(null));
    return () => controller.abort();
  }, [placement]);

  if (!item) return null;

  async function open() {
    if (!item || opening) return;
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>("/api/v1/ads/click-v2", { method: "POST", body: { impressionId: item.impressionId } });
      // Same-origin paths only ("//host" and "/\host" are other sites); anything else must be a
      // plain https URL. Never navigate to an unexpected scheme.
      const internal = safeNextPath(url, "");
      if (internal) window.location.assign(internal);
      else if (isSafeDestination(url)) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // The click could not be recorded; do not navigate to an unverified destination.
    } finally {
      setOpening(false);
    }
  }

  const media = item.media.find((m) => m.url);
  return (
    <aside aria-label="Sponsored" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="space-y-2 p-5 pb-3">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Megaphone className="size-3.5" aria-hidden="true" /> Sponsored · {item.advertiserName}
        </p>
        {item.primaryText ? <p className="text-sm whitespace-pre-line">{item.primaryText}</p> : null}
      </div>
      {media?.url ? (
        media.kind === "video" ? (
          <video src={media.url} className="aspect-video w-full bg-black object-cover" controls muted playsInline preload="metadata" />
        ) : (
          // Short-lived signed URL from the private ad-media bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt="" className="aspect-[1.91/1] w-full object-cover" loading="lazy" />
        )
      ) : null}
      <div className="flex items-center justify-between gap-3 p-5 pt-3">
        <div className="min-w-0">
          {item.headline ? <p className="display text-xl">{item.headline}</p> : null}
          {item.description ? <p className="text-sm text-muted">{item.description}</p> : null}
        </div>
        {item.hasDestination ? (
          <button
            type="button"
            onClick={open}
            disabled={opening}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
          >
            {CTA_LABELS[item.cta]} <ArrowUpRight className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
