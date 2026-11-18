import { VerifiedTick } from "@/components/ui/verified-badge";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { Meter } from "@/components/dashboard/widgets";
import { Avatar } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { publicMediaUrl } from "@/lib/media";
import { VERIFICATION_LABELS } from "@backend/modules/auth/permissions";
import { networkStats } from "@backend/modules/discovery/service";
import { profileCompleteness } from "@backend/modules/profiles/completeness";
import { getOwnProfileDetail } from "@backend/modules/profiles/service";
import { MEMBER_TYPE_LABELS, type MemberType } from "@backend/modules/profiles/types";
import { requirePageSession } from "@backend/auth/viewer";

/** The member's own identity card: cover, avatar, role, verification, network numbers and profile strength. */
export async function IdentityCard() {
  const { viewer, db } = await requirePageSession({ next: "/home" });
  const [profile, stats] = await Promise.all([attempt(() => getOwnProfileDetail(db, viewer)), attempt(() => networkStats(db, viewer))]);
  const p = profile.ok ? profile.data : null;
  const cover = publicMediaUrl("profile-media", p?.cover_path ?? null);
  const completeness = p ? profileCompleteness(p) : null;
  const memberType = p?.member_type ? MEMBER_TYPE_LABELS[p.member_type as MemberType] : null;
  const role = [p?.job_title, p?.company].filter(Boolean).join(" · ");

  return (
    <section aria-label="Your profile" className="panel overflow-hidden">
      <div className="relative h-20 bg-surface-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- member-uploaded cover from storage
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-[linear-gradient(120deg,var(--surface-3),var(--surface-2)_55%,color-mix(in_oklab,var(--accent)_18%,var(--surface-2)))]" aria-hidden="true" />
        )}
      </div>
      <div className="px-5 pb-5">
        <div className="-mt-9 flex items-end justify-between">
          <Avatar src={publicMediaUrl("profile-media", viewer.avatarPath)} name={viewer.displayName} size={72} className="ring-4 ring-surface" />
          <Link href="/profile/edit" className="mb-1 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-fg">
            <Pencil className="size-3" aria-hidden="true" /> Edit
          </Link>
        </div>
        <Link href={`/members/${viewer.handle}`} className="mt-3 block hover:opacity-90">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            {viewer.displayName}
            {viewer.verifiedKinds.length > 0 ? (
              <VerifiedTick
                tier={viewer.verifiedKinds.some((k) => k !== "identity") ? "distinguished" : "identity"}
                label={viewer.verifiedKinds.map((k) => VERIFICATION_LABELS[k]).join(", ")}
                size={18}
              />
            ) : null}
          </h2>
          <p className="text-sm text-muted">@{viewer.handle}</p>
        </Link>
        {p?.headline ? <p className="mt-2 line-clamp-2 text-sm leading-5">{p.headline}</p> : null}
        {role || memberType ? (
          <p className="mt-2 text-xs text-muted">
            {[memberType, role].filter(Boolean).join(" · ")}
          </p>
        ) : null}

        {stats.ok ? (
          <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-xl border border-border text-center">
            <StatLink href="/connections" label="Connections" value={stats.data.connections} />
            <StatLink href={`/members/${viewer.handle}`} label="Followers" value={stats.data.followers} />
            <StatLink href="/connections?tab=received" label="Requests" value={stats.data.pendingReceived} highlight={stats.data.pendingReceived > 0} />
          </dl>
        ) : null}

        {completeness && completeness.missing.length > 0 ? (
          <Link href={completeness.missing[0]!.href} className="mt-4 block rounded-xl bg-surface-2 p-3 hover:bg-surface-3">
            <span className="flex items-center justify-between text-xs">
              <span className="font-medium">Profile strength</span>
              <span className="tabular-nums text-muted">{completeness.percent}%</span>
            </span>
            <span className="mt-2 block">
              <Meter value={completeness.percent} label="Profile strength" />
            </span>
            <span className="mt-2 block text-xs text-muted">Next: {completeness.missing[0]!.label}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function StatLink({ href, label, value, highlight }: { href: string; label: string; value: number; highlight?: boolean }) {
  return (
    <Link href={href} className="flex flex-col-reverse py-2.5 hover:bg-surface-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${highlight ? "text-accent" : ""}`}>{value}</dd>
    </Link>
  );
}
