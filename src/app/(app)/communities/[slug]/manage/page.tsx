import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArchiveButton } from "@/components/communities/archive-button";
import { CommunityForm } from "@/components/communities/community-form";
import { MemberManager } from "@/components/communities/member-manager";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { isStaff } from "@backend/modules/auth/permissions";
import { getCommunity, listMembers } from "@backend/modules/communities/service";
import { requirePageSession } from "@backend/auth/viewer";

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = { title: "Manage community", robots: { index: false } };

export default async function ManageCommunityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { viewer, db } = await requirePageSession({ next: `/communities/${slug}/manage` });
  const found = await attempt(() => getCommunity(db, viewer, slug));
  if (!found.ok) return <ServiceNotice error={found.error} what="this community" />;
  const c = found.data;
  if (!c) notFound();
  // UI gate only; every action is re-checked by the database.
  if (!c.canModerate) redirect(`/communities/${c.slug}`);

  const [pending, members, banned] = await Promise.all([
    attempt(() => listMembers(db, c.id, "pending")),
    attempt(() => listMembers(db, c.id, "active")),
    attempt(() => listMembers(db, c.id, "banned")),
  ]);
  const canEdit = c.isOwner || isStaff(viewer, "moderator");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href={`/communities/${c.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> {c.name}
      </Link>
      <PageHeader eyebrow="Manage" title={c.name} description={c.isOwner ? "You own this community." : "You moderate this community."} />

      {!pending.ok || !members.ok || !banned.ok ? (
        <ServiceNotice error={!pending.ok ? pending.error : !members.ok ? members.error : !banned.ok ? banned.error : null} what="members" />
      ) : (
        <MemberManager communityId={c.id} pending={pending.data} members={members.data} banned={banned.data} isOwner={c.isOwner} viewerId={viewer.id} />
      )}

      {canEdit ? (
        <section aria-labelledby="details-h" className="space-y-4">
          <h2 id="details-h" className="text-sm font-semibold tracking-wide">
            Details
          </h2>
          <CommunityForm community={c} />
          <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{c.archived ? "Archived" : "Archive community"}</p>
              <p className="text-sm text-muted">Archived communities are hidden from discovery and closed to new posts.</p>
            </div>
            <ArchiveButton communityId={c.id} archived={c.archived} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
