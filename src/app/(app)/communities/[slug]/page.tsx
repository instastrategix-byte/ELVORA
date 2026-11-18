import { ArrowLeft, Lock, MessageSquare, Pin, Settings, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MembershipButton } from "@/components/communities/membership-button";
import { ThreadComposer } from "@/components/communities/thread-composer";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatRelative } from "@/lib/format";
import { getCommunity, listMembers, listThreads } from "@backend/modules/communities/service";
import { requirePageSession } from "@backend/auth/viewer";

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = { title: "Community", robots: { index: false } };

export default async function CommunityPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const { viewer, db } = await requirePageSession({ next: `/communities/${slug}` });
  const sp = await searchParams;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;

  const found = await attempt(() => getCommunity(db, viewer, slug));
  if (!found.ok) return <ServiceNotice error={found.error} what="this community" />;
  const c = found.data;
  if (!c) notFound();

  const [threads, members] = await Promise.all([
    c.canRead ? attempt(() => listThreads(db, viewer, c.id, cursor)) : null,
    c.canRead ? attempt(() => listMembers(db, c.id, "active")) : null,
  ]);
  const moderators = members?.ok ? members.data.filter((m) => m.role !== "member") : [];

  return (
    <div className="space-y-6">
      <Link href="/communities" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> Communities
      </Link>

      <header className="panel overflow-hidden">
        <div className="h-32 bg-surface-3 sm:h-44">
          {c.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member-uploaded cover from storage
            <img src={c.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <div aria-hidden="true" className="size-full bg-[linear-gradient(120deg,var(--surface-3),var(--surface-2)_60%,color-mix(in_oklab,var(--accent)_18%,var(--surface-2)))]" />
          )}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div className="min-w-0">
            {c.category ? <p className="eyebrow">{c.category}</p> : null}
            <h1 className="display mt-1 flex items-center gap-2 text-3xl sm:text-4xl">
              {c.name}
              {c.visibility === "private" ? <Lock className="size-5 text-muted" aria-label="Private community" /> : null}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Users className="size-4" aria-hidden="true" /> {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
              </span>
              <span>{c.visibility === "private" ? "Private: members approved by moderators" : "Open to all members"}</span>
              {c.archived ? <Badge>Archived</Badge> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {c.canModerate ? (
              <Button asChild variant="outline">
                <Link href={`/communities/${c.slug}/manage`}>
                  <Settings aria-hidden="true" /> Manage
                </Link>
              </Button>
            ) : null}
            <MembershipButton communityId={c.id} visibility={c.visibility} status={c.myStatus} role={c.myRole} archived={c.archived} />
          </div>
        </div>
      </header>

      {c.myStatus === "banned" ? <Alert tone="warning">You&apos;ve been removed from this community by its moderators.</Alert> : null}
      {c.myStatus === "pending" ? <Alert tone="info">Your request to join is waiting for a moderator. You&apos;ll be notified when it&apos;s approved.</Alert> : null}
      {c.archived ? <Alert tone="info">This community is archived. Members can read past discussions, but nobody can post.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {!c.canRead ? (
            <EmptyState
              icon={<Lock />}
              title="Private discussions"
              description="Discussions here are visible to approved members. Request to join to take part."
            />
          ) : (
            <>
              {c.canPost ? <ThreadComposer communityId={c.id} slug={c.slug} /> : null}
              {!threads || !threads.ok ? (
                <ServiceNotice error={threads && !threads.ok ? threads.error : null} what="discussions" />
              ) : threads.data.items.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare />}
                  title="No discussions yet"
                  description={c.canPost ? "Start the first discussion for this community." : "Join the community to start the first discussion."}
                />
              ) : (
                <ul className="space-y-3">
                  {threads.data.items.map((t) => (
                    <li key={t.id}>
                      <article className="panel-interactive relative p-5">
                        <div className="flex items-center gap-2 text-xs text-muted">
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
                        <h2 className="mt-1 text-lg font-semibold">
                          <Link href={`/communities/${c.slug}/threads/${t.id}`} className="after:absolute after:inset-0 hover:text-accent">
                            {t.title}
                          </Link>
                        </h2>
                        <p className="mt-1 line-clamp-2 text-sm text-muted">{t.excerpt}</p>
                        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3">
                          <MemberLink member={t.author} size={28} subtitle={`Started ${formatRelative(t.createdAt)}`} />
                          <p className="text-xs text-muted">
                            {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"} · active {formatRelative(t.lastActivityAt)}
                          </p>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
              {threads?.ok && threads.data.nextCursor ? (
                <div className="flex justify-center">
                  <Button asChild variant="outline">
                    <Link href={`/communities/${c.slug}?cursor=${encodeURIComponent(threads.data.nextCursor)}`}>Older discussions</Link>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="space-y-4" aria-label="About this community">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold tracking-wide">About</h2>
            <p className="mt-3 text-sm leading-6 whitespace-pre-line text-fg/90">{c.description || "No description yet."}</p>
            <p className="mt-4 text-xs text-muted">Created {formatRelative(c.createdAt)} by</p>
            <div className="mt-2">
              <MemberLink member={c.createdBy} size={32} />
            </div>
          </section>
          {moderators.length > 0 ? (
            <section className="panel p-5">
              <h2 className="text-sm font-semibold tracking-wide">Moderators</h2>
              <ul className="mt-3 space-y-3">
                {moderators.map((m) => (
                  <li key={m.profile.id}>
                    <MemberLink member={m.profile} size={32} subtitle={m.role === "owner" ? "Owner" : "Moderator"} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
