import { useId } from "react";
import { cn } from "@/lib/utils";
import { VERIFICATION_LABELS, type VerificationKind } from "@backend/modules/auth/permissions";

// Twelve-lobed rosette seal (generated: r(θ) = 10.2 + 1.1·cos 12θ in a 24×24 box).
const SEAL =
  "M12.00 0.70 L12.72 1.05 L13.33 1.89 L13.84 2.76 L14.36 3.21 L15.03 3.08 L15.90 2.58 L16.86 2.15 L17.65 2.21 L18.10 2.87 L18.21 3.91 L18.21 4.92 L18.43 5.57 L19.08 5.79 L20.09 5.79 L21.13 5.90 L21.79 6.35 L21.85 7.14 L21.42 8.10 L20.92 8.97 L20.79 9.64 L21.24 10.16 L22.11 10.67 L22.95 11.28 L23.30 12.00 L22.95 12.72 L22.11 13.33 L21.24 13.84 L20.79 14.36 L20.92 15.03 L21.42 15.90 L21.85 16.86 L21.79 17.65 L21.13 18.10 L20.09 18.21 L19.08 18.21 L18.43 18.43 L18.21 19.08 L18.21 20.09 L18.10 21.13 L17.65 21.79 L16.86 21.85 L15.90 21.42 L15.03 20.92 L14.36 20.79 L13.84 21.24 L13.33 22.11 L12.72 22.95 L12.00 23.30 L11.28 22.95 L10.67 22.11 L10.16 21.24 L9.64 20.79 L8.97 20.92 L8.10 21.42 L7.14 21.85 L6.35 21.79 L5.90 21.13 L5.79 20.09 L5.79 19.08 L5.57 18.43 L4.92 18.21 L3.91 18.21 L2.87 18.10 L2.21 17.65 L2.15 16.86 L2.58 15.90 L3.08 15.03 L3.21 14.36 L2.76 13.84 L1.89 13.33 L1.05 12.72 L0.70 12.00 L1.05 11.28 L1.89 10.67 L2.76 10.16 L3.21 9.64 L3.08 8.97 L2.58 8.10 L2.15 7.14 L2.21 6.35 L2.87 5.90 L3.91 5.79 L4.92 5.79 L5.57 5.57 L5.79 4.92 L5.79 3.91 L5.90 2.87 L6.35 2.21 L7.14 2.15 L8.10 2.58 L8.97 3.08 L9.64 3.21 L10.16 2.76 L10.67 1.89 L11.28 1.05Z";
const SQUARE = "M6 1.5h12A4.5 4.5 0 0 1 22.5 6v12a4.5 4.5 0 0 1-4.5 4.5H6A4.5 4.5 0 0 1 1.5 18V6A4.5 4.5 0 0 1 6 1.5Z";
const CHECK = "M7.4 12.3l3.1 3.1 6.2-6.6";

export type VerifiedTier = "identity" | "distinguished" | "business";

const TIERS: Record<VerifiedTier, { from: string; to: string; check: string; shape: string }> = {
  // Identity: a cool blue seal — the universally recognised "verified" cue.
  identity: { from: "#5aa2ff", to: "#2f6fe0", check: "#ffffff", shape: SEAL },
  // Verified executives and public figures: gold seal.
  distinguished: { from: "#f3dda6", to: "#b8903f", check: "#1a1306", shape: SEAL },
  // Verified businesses: gold rounded-square seal.
  business: { from: "#f3dda6", to: "#b8903f", check: "#1a1306", shape: SQUARE },
};

/** A single verification tick. Purely presentational; meaning is carried by `label` for assistive tech. */
export function VerifiedTick({ tier, label, size = 16, className }: { tier: VerifiedTier; label: string; size?: number; className?: string }) {
  const id = useId();
  const t = TIERS[tier];
  return (
    <span className={cn("inline-flex shrink-0 align-[-0.15em]", className)} title={label}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={t.from} />
            <stop offset="1" stopColor={t.to} />
          </linearGradient>
        </defs>
        <path d={t.shape} fill={`url(#${id})`} />
        <path d={CHECK} fill="none" stroke={t.check} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Shows only staff-approved verification (profiles.verified_kinds and business approval are not
 * client-writable). Compact mode shows the single highest tick next to a name; full mode adds labels.
 */
export function VerifiedBadges({ kinds, business, compact }: { kinds: readonly VerificationKind[]; business?: boolean; compact?: boolean }) {
  const distinguished = kinds.filter((k) => k !== "identity");
  const hasIdentity = kinds.includes("identity");
  if (!distinguished.length && !hasIdentity && !business) return null;

  if (compact) {
    const label = distinguished.length
      ? distinguished.map((k) => VERIFICATION_LABELS[k]).join(", ")
      : hasIdentity
        ? VERIFICATION_LABELS.identity
        : "Verified business";
    return <VerifiedTick tier={distinguished.length ? "distinguished" : hasIdentity ? "identity" : "business"} label={label} />;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
      {distinguished.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <VerifiedTick tier="distinguished" label="" />
          {VERIFICATION_LABELS[k]}
        </span>
      ))}
      {hasIdentity && distinguished.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
          <VerifiedTick tier="identity" label="" />
          {VERIFICATION_LABELS.identity}
        </span>
      ) : null}
      {business ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <VerifiedTick tier="business" label="" />
          Verified business
        </span>
      ) : null}
    </span>
  );
}
