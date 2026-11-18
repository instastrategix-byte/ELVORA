import { ArrowLeft, Lock, Pin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Replies } from "@/components/communities/replies";
import { ThreadActions } from "@/components/communities/thread-actions";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { getCommunity, getThread, listReplies } from "@backend/modules/communities/service";
import { requirePageSession } from "@backend/auth/viewer";

type Params = Promise<{ slug: string; id: string }>;

export const metadata: Metadata = { title: "Discussion", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ThreadPage({ params }: { params: Params }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { viewer, db } = await requirePageSession({ next: `/communities/${slug}/threads/${id}` });

  const [community, thread, replies] = await Promise.all([
    attempt(() => getCommunity(db, viewer, slug)),
    attempt(() => getThread(db, viewer, id)),
    attempt(() => listReplies(db, viewer, id)),
  ]);
  if (!community.ok) return <ServiceNotice error={community.error} what="this community" />;
  if (!thread.ok) return <ServiceNotice error={thread.error} what="this discussion" />;
  const c = community.data;
  const t = thread.data;
  // RLS returns no thread when the viewer may not read it; also guard against a mismatched slug.
  if (!c || !t || t.communityId !== c.id) notFound();

  const canReply = c.canPost && !t.locked;
  const lockedReason = t.locked
    ? "Replies are locked on this discussion."
    : c.archived
      ? "This community is archived."
      : c.myStatus !== "active"
        ? "Join the community to reply."
        : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/communities/${c.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> {c.name}
      </Link>

      <article className="panel p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-xs text-muted">
              {t.pinned ? (
                <span className="inline-flex items-center gap-1 text-accent">
                  <Pin className="size-3.5" aria-hidden="true" /> Pinned
                </span>
              ) : null}
              {t.locked ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" aria-hidden="true" /> Locked
                </span>
              ) : null}
            </div>
            <h1 className="display mt-1 text-3xl">{t.title}</h1>
          </div>
          <ThreadActions threadId={t.id} slug={c.slug} pinned={t.pinned} locked={t.locked} canModerate={c.canModerate} isOwn={t.isOwn} />
        </div>
        <div className="mt-4">
          <MemberLink member={t.author} size={36} subtitle={<time dateTime={t.createdAt}>{formatRelative(t.createdAt)}</time>} />
        </div>
        <p className="mt-5 text-[15px] leading-7 whitespace-pre-line break-words">{t.body}</p>
      </article>

      {!replies.ok ? (
        <ServiceNotice error={replies.error} what="replies" />
      ) : (
        <Replies threadId={t.id} initial={replies.data} canReply={canReply} canModerate={c.canModerate} lockedReason={canReply ? null : lockedReason} />
      )}
    </div>
  );
}
