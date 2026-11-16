import { Anchor, Building, Car, Gem, Hotel, PartyPopper, Sailboat, Trees } from "lucide-react";
import { CATEGORY_LABELS, type ListingCategory } from "@backend/modules/listings/schemas";
import { cn } from "@/lib/utils";

const ART: Record<ListingCategory, { icon: typeof Hotel; tint: string }> = {
  hotel: { icon: Hotel, tint: "#3a2e1a" },
  resort: { icon: Trees, tint: "#1d3029" },
  villa: { icon: Building, tint: "#3b2a1a" },
  apartment: { icon: Gem, tint: "#26263a" },
  supercar: { icon: Car, tint: "#3a1f1d" },
  yacht: { icon: Sailboat, tint: "#18293a" },
  event: { icon: PartyPopper, tint: "#30203a" },
  experience: { icon: Anchor, tint: "#2c2f1a" },
};

/**
 * Category imagery. Renders the photo when `src` is set; otherwise brand artwork: a deep tinted
 * gradient, a fine gold line motif, an engraved category name and a small emblem. Also used as the
 * graceful fallback for listings without photos.
 */
export function CategoryArt({
  category,
  className,
  label,
  src,
  showName = false,
}: {
  category: ListingCategory;
  className?: string;
  label?: string;
  src?: string | null;
  showName?: boolean;
}) {
  const { icon: Icon, tint } = ART[category];
  const a11y = { role: label ? "img" : undefined, "aria-label": label, "aria-hidden": label ? undefined : true } as const;

  if (src) {
    return (
      <div {...a11y} className={cn("relative overflow-hidden bg-surface-2", className)}>
        {/* Site-owned photography from /public; plain img keeps arbitrary aspect ratios simple. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      </div>
    );
  }

  return (
    <div
      {...a11y}
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${tint} 0%, #0d0c0b 62%), linear-gradient(160deg, ${tint}66, #08080a)`,
      }}
    >
      <svg className="absolute inset-0 size-full opacity-[0.16]" aria-hidden="true">
        <defs>
          <pattern id={`lines-${category}`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="22" stroke="#c9a961" strokeWidth="0.5" />
          </pattern>
          <radialGradient id={`fade-${category}`} cx="80%" cy="15%" r="90%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={`mask-${category}`}>
            <rect width="100%" height="100%" fill={`url(#fade-${category})`} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={`url(#lines-${category})`} mask={`url(#mask-${category})`} />
      </svg>
      <div className="absolute inset-3 rounded-[inherit] border border-[#c9a961]/15" aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-full border border-[#c9a961]/30 bg-black/20 backdrop-blur-sm">
          <Icon className="size-6 text-[#e2c88f]" strokeWidth={1.2} aria-hidden="true" />
        </span>
        {showName ? (
          <span className="font-display text-xl tracking-[0.18em] text-[#f0dcae]/80 uppercase">{CATEGORY_LABELS[category]}</span>
        ) : null}
      </div>
    </div>
  );
}
