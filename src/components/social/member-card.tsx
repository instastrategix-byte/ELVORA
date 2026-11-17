import { MapPin } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import type { ProfileSummary } from "@backend/modules/profiles/types";

export function MemberCard({ member }: { member: ProfileSummary }) {
  return (
    <article className="panel-interactive relative flex items-start gap-4 p-5">
      <Avatar src={member.avatarUrl} name={member.displayName} size={56} className={member.verifiedKinds.length > 0 ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-surface" : undefined} />
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 truncate font-medium">
          <Link href={`/members/${member.handle}`} className="truncate after:absolute after:inset-0">
            {member.displayName}
          </Link>
          <VerifiedBadges kinds={member.verifiedKinds} compact />
        </h3>
        {member.headline ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{member.headline}</p> : null}
        {member.location ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3" aria-hidden="true" /> {member.location}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function MemberLink({ member, size = 40, subtitle }: { member: ProfileSummary; size?: number; subtitle?: React.ReactNode }) {
  const inner = (
    <>
      <Avatar src={member.avatarUrl} name={member.displayName} size={size} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
          {member.displayName}
          <VerifiedBadges kinds={member.verifiedKinds} compact />
        </span>
        {subtitle ? <span className="block truncate text-xs text-muted">{subtitle}</span> : null}
      </span>
    </>
  );
  return member.handle ? (
    <Link href={`/members/${member.handle}`} className="flex min-w-0 items-center gap-3 hover:opacity-90">
      {inner}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-3">{inner}</span>
  );
}
