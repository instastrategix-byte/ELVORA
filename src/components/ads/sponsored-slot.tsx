"use client";

import { ArrowUpRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { SponsoredItem } from "@backend/modules/ads/service";

/**
 * A clearly labelled sponsored placement. The server decides eligibility (approved campaign,
 * schedule, budget, frequency cap, targeting) and records the impression when serving.
 * Renders nothing when no campaign is eligible or the service is unavailable.
 */
export function SponsoredSlot({ placement }: { placement: "feed" | "luxury" | "discover" }) {
  const [item, setItem] = useState<SponsoredItem | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<SponsoredItem[]>(`/api/v1/ads/serve?placement=${placement}`, { signal: controller.signal })
      .then((items) => setItem(items[0] ?? null))
      .catch(() => setItem(null));
    return () => controller.abort();
  }, [placement]);

  if (!item) return null;

  async function open() {
    if (!item || opening) return;
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>("/api/v1/ads/click", { method: "POST", body: { impressionId: item.impressionId } });
      if (url.startsWith("/")) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // The click could not be recorded; do not navigate to an unverified destination.
    } finally {
      setOpening(false);
    }
  }

  return (
    <aside aria-label="Sponsored" className="rounded-2xl border border-border bg-surface p-5">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Megaphone className="size-3.5" aria-hidden="true" /> Sponsored · {item.advertiserName}
      </p>
      <p className="display mt-2 text-2xl">{item.headline}</p>
      {item.body ? <p className="mt-1 text-sm text-muted">{item.body}</p> : null}
      {item.hasDestination ? (
        <button type="button" onClick={open} disabled={opening} className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
          Learn more <ArrowUpRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}
