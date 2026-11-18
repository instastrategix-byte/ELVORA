import { Lock, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import type { CommunityCard as CommunityCardData } from "@backend/modules/communities/types";

export function CommunityCard({ community }: { community: CommunityCardData }) {
  const c = community;
  return (
    <article className="panel-interactive relative flex h-full flex-col overflow-hidden">
      <div className="relative h-24 bg-surface-3">
        {c.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- member-uploaded cover from storage
          <img src={c.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-full items-end bg-[linear-gradient(120deg,var(--surface-3),var(--surface-2)_60%,color-mix(in_oklab,var(--accent)_16%,var(--surface-2)))] p-4"
          >
            <span className="display text-3xl text-fg/25">{c.name.slice(0, 1)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="flex items-center gap-2 font-semibold">
          <Link href={`/communities/${c.slug}`} className="truncate after:absolute after:inset-0">
            {c.name}
          </Link>
          {c.visibility === "private" ? <Lock className="size-3.5 shrink-0 text-muted" aria-label="Private community" /> : null}
        </h3>
        {c.category ? <p className="mt-0.5 text-xs text-accent">{c.category}</p> : null}
        {c.description ? <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" /> {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
          </span>
          {c.myStatus === "active" ? (
            <Badge tone="success">{c.myRole === "owner" ? "Owner" : c.myRole === "moderator" ? "Moderator" : "Joined"}</Badge>
          ) : c.myStatus === "pending" ? (
            <Badge tone="warning">Requested</Badge>
          ) : c.archived ? (
            <Badge>Archived</Badge>
          ) : null}
        </div>
      </div>
    </article>
  );
}
