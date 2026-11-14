import { BadgeCheck, Building2 } from "lucide-react";
import { VERIFICATION_LABELS, type VerificationKind } from "@backend/modules/auth/permissions";

/** Shows only staff-approved verification badges (profiles.verified_kinds is not client-writable). */
export function VerifiedBadges({ kinds, business, compact }: { kinds: readonly VerificationKind[]; business?: boolean; compact?: boolean }) {
  const shown = kinds.filter((k) => k !== "identity");
  const hasIdentity = kinds.includes("identity");
  if (!shown.length && !hasIdentity && !business) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {shown.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 text-accent" title={VERIFICATION_LABELS[k]}>
          <BadgeCheck className="size-4" aria-hidden="true" />
          {compact ? <span className="sr-only">{VERIFICATION_LABELS[k]}</span> : <span className="text-xs">{VERIFICATION_LABELS[k]}</span>}
        </span>
      ))}
      {hasIdentity && shown.length === 0 ? (
        <span className="inline-flex items-center text-accent" title={VERIFICATION_LABELS.identity}>
          <BadgeCheck className="size-4" aria-hidden="true" />
          <span className="sr-only">{VERIFICATION_LABELS.identity}</span>
        </span>
      ) : null}
      {business ? (
        <span className="inline-flex items-center gap-1 text-accent" title="Verified business">
          <Building2 className="size-4" aria-hidden="true" />
          {compact ? <span className="sr-only">Verified business</span> : <span className="text-xs">Verified business</span>}
        </span>
      ) : null}
    </span>
  );
}
