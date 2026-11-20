import { ArrowUpRight, ImageOff, Megaphone, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { CTA_LABELS, FORMAT_LABELS, type AdPlacement, type CreativeFormat, type Cta } from "@backend/modules/advertising/constants";

export type PreviewCreative = {
  format: CreativeFormat;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  cta: Cta;
  destinationUrl: string | null;
  media: { kind: "image" | "video"; url?: string | null; previewUrl?: string | null }[];
};

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Media({ item, className }: { item: PreviewCreative["media"][number] | undefined; className?: string }) {
  const src = item?.previewUrl ?? item?.url ?? null;
  if (!item || !src) {
    return (
      <div className={cn("flex items-center justify-center bg-surface-2 text-muted", className)}>
        <ImageOff className="size-6" aria-hidden="true" />
        <span className="sr-only">No media</span>
      </div>
    );
  }
  if (item.kind === "video") {
    return (
      <div className={cn("relative bg-black", className)}>
        <video src={src} className="size-full object-cover" muted playsInline preload="metadata" />
        <Play className="absolute inset-0 m-auto size-10 text-white/90 drop-shadow" aria-hidden="true" />
      </div>
    );
  }
  // Signed URLs from the private ad-media bucket (or a local object URL while editing).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={cn("object-cover", className)} />;
}

/**
 * How an ad will look in a placement. Always carries the "Sponsored" label, exactly like the
 * served ad. A preview only — it doesn't record anything.
 */
export function AdPreview({ creative, placement = "feed", advertiser }: { creative: PreviewCreative; placement?: AdPlacement; advertiser: string }) {
  const cta = CTA_LABELS[creative.cta];
  const site = host(creative.destinationUrl);
  const label = (
    <p className="flex items-center gap-1.5 text-xs text-muted">
      <Megaphone className="size-3.5" aria-hidden="true" /> Sponsored · {advertiser}
    </p>
  );

  if (placement === "stories") {
    return (
      <div className="relative mx-auto aspect-[9/16] w-full max-w-56 overflow-hidden rounded-2xl border border-border bg-black text-white">
        <Media item={creative.media[0]} className="absolute inset-0 size-full" />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3 text-xs">Sponsored · {advertiser}</div>
        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-3">
          {creative.headline ? <p className="text-sm font-semibold">{creative.headline}</p> : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-black">
            {cta} <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    );
  }

  const compact = placement !== "feed";
  return (
    <article aria-label={`Preview: ${FORMAT_LABELS[creative.format]}`} className={cn("overflow-hidden rounded-2xl border border-border bg-surface", compact && "max-w-72")}>
      <div className="space-y-2 p-4 pb-3">
        {label}
        {creative.primaryText && !compact ? <p className="text-sm whitespace-pre-line">{creative.primaryText}</p> : null}
      </div>
      {creative.format === "carousel" && creative.media.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
          {creative.media.map((m, i) => (
            <Media key={i} item={m} className="aspect-square w-40 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : creative.media.length ? (
        <Media item={creative.media[0]} className={cn("w-full", compact ? "aspect-[4/3]" : "aspect-[1.91/1]")} />
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <div className="min-w-0">
          {site ? <p className="truncate text-xs text-muted uppercase">{site}</p> : null}
          <p className="truncate font-medium">{creative.headline || (creative.format === "sponsored_post" ? "Promoted post" : "Your headline")}</p>
          {creative.description ? <p className="truncate text-xs text-muted">{creative.description}</p> : null}
        </div>
        <span className="shrink-0 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium">{cta}</span>
      </div>
    </article>
  );
}
