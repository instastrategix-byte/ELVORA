import { Anchor, Building, Car, Gem, Hotel, PartyPopper, Sailboat, Trees } from "lucide-react";
import type { ListingCategory } from "@backend/modules/listings/schemas";
import { cn } from "@/lib/utils";

const ART: Record<ListingCategory, { icon: typeof Hotel; gradient: string }> = {
  hotel: { icon: Hotel, gradient: "from-[#2a2418] via-[#141210] to-[#0d0c0b]" },
  resort: { icon: Trees, gradient: "from-[#1c2622] via-[#111614] to-[#0b0d0c]" },
  villa: { icon: Building, gradient: "from-[#2b2117] via-[#16120e] to-[#0d0b0a]" },
  apartment: { icon: Gem, gradient: "from-[#1f1f28] via-[#131318] to-[#0b0b0e]" },
  supercar: { icon: Car, gradient: "from-[#2a1a19] via-[#151010] to-[#0d0a0a]" },
  yacht: { icon: Sailboat, gradient: "from-[#16212b] via-[#0f141a] to-[#0a0c0f]" },
  event: { icon: PartyPopper, gradient: "from-[#26192a] via-[#141016] to-[#0c0a0d]" },
  experience: { icon: Anchor, gradient: "from-[#232516] via-[#131410] to-[#0c0c0a]" },
};

/**
 * Brand-safe placeholder art for listings without photography: an abstract gradient with a
 * fine line motif. Used as the graceful fallback for missing or failed images.
 */
export function CategoryArt({ category, className, label }: { category: ListingCategory; className?: string; label?: string }) {
  const { icon: Icon, gradient } = ART[category];
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative overflow-hidden bg-gradient-to-br", gradient, className)}
    >
      <svg className="absolute inset-0 size-full opacity-[0.12]" aria-hidden="true">
        <defs>
          <pattern id={`lines-${category}`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="28" stroke="#c9ab6c" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#lines-${category})`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="size-10 text-[#c9ab6c]/70" strokeWidth={1.2} aria-hidden="true" />
      </div>
    </div>
  );
}
