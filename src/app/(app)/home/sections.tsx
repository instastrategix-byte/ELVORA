import { BadgeCheck, Building2, Heart, Inbox, Megaphone, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Stat, Widget, WidgetError } from "@/components/dashboard/widgets";
import { ListingCard } from "@/components/listings/listing-card";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate, formatRelative } from "@/lib/format";
import { describeNotification } from "@/lib/notification-text";
import { queueCounts } from "@backend/modules/admin/service";
import { listCampaigns } from "@backend/modules/ads/service";
import { hasFeature, isStaff, VERIFICATION_LABELS } from "@backend/modules/auth/permissions";
import { networkStats, suggestMembers } from "@backend/modules/discovery/service";
import { listFeed } from "@backend/modules/feed/service";
import { browseListings, listOwnListings, listReceivedInquiries } from "@backend/modules/listings/service";
import { getMembershipOverview } from "@backend/modules/membership/service";
import { unreadConversationCount } from "@backend/modules/messaging/service";
import { listNotifications, unreadNotificationCount } from "@backend/modules/notifications/service";
import { requirePageSession } from "@backend/auth/viewer";

const session = () => requirePageSession({ next: "/home" });

export async function StatsSection() {
  const { viewer, db } = await session();
  const [stats, unreadMessages, unreadNotifications] = await Promise.all([
    attempt(() => networkStats(db, viewer)),
    attempt(() => unreadConversationCount(db)),
    attempt(() => unreadNotificationCount(db, viewer)),
  ]);
  const s = stats.ok ? stats.data : null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="Connections"
        value={s?.connections ?? "—"}
        hint={s && s.newConnections30d > 0 ? `+${s.newConnections30d} in 30 days` : undefined}
        href="/connections"
      />
      <Stat
        label="Requests waiting"
        value={s?.pendingReceived ?? "—"}
        hint={s && s.pendingReceived > 0 ? "Review now" : undefined}
        href="/connections?tab=received"
      />
      <Stat label="Followers" value={s?.followers ?? "—"} hint={s ? `Following ${s.following}` : undefined} />
      <Stat label="Unread conversations" value={unreadMessages.ok ? unreadMessages.data : "—"} href="/messages" />
      <Stat label="Unread notifications" value={unreadNotifications.ok ? unreadNotifications.data : "—"} href="/notifications" />
    </div>
  );
}

export async function SuggestionsSection() {
  const { viewer, db } = await session();
  const canConnect = hasFeature(viewer, "connections.request");
  const result = await attempt(() => suggestMembers(db, viewer, 5));
  return (
    <Widget title="People you may know" href="/discover" hrefLabel="Discover">
      {!result.ok ? (
        <WidgetError what="suggestions" />
      ) : result.data.length === 0 ? (
        <p className="text-sm text-muted">
          No new suggestions yet. Add your industry, city and interests to your profile and we&apos;ll find members worth knowing.
        </p>
      ) : (
        <ul className="space-y-4">
          {result.data.map(({ member, reason }) => (
            <li key={member.id} className="flex items-center justify-between gap-3">
              <MemberLink member={member} subtitle={reason} />
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={`/members/${member.handle}`}>{canConnect ? "Connect" : "View"}</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export async function NetworkPostsSection() {
  const { viewer, db } = await session();
  const network = await attempt(() => listFeed(db, viewer, { scope: "network" }));
  // A quiet network falls back to the wider community so the panel is never empty for new members.
  const useAll = network.ok && network.data.items.length === 0;
  const result = useAll ? await attempt(() => listFeed(db, viewer, { scope: "all" })) : network;
  return (
    <Widget title={useAll ? "Trending in the community" : "From your network"} href={useAll ? "/feed?scope=all" : "/feed"} hrefLabel="Open feed">
      {!result.ok ? (
        <WidgetError what="posts" />
      ) : result.data.items.length === 0 ? (
        <div className="space-y-3 text-sm text-muted">
          <p>No posts yet. Be the first to share a perspective, an opportunity or a milestone.</p>
          <Button asChild size="sm">
            <Link href="/feed">Write a post</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {(useAll ? [...result.data.items].sort((a, b) => b.likeCount + b.commentCount - (a.likeCount + a.commentCount)) : result.data.items)
            .slice(0, 4)
            .map((post) => (
              <li key={post.id} className="py-4 first:pt-0 last:pb-0">
                <MemberLink member={post.author} size={32} subtitle={formatRelative(post.createdAt)} />
                <Link href={`/posts/${post.id}`} className="mt-2 block line-clamp-3 text-sm leading-6 text-fg/90 hover:text-fg">
                  {post.body}
                </Link>
                <p className="mt-2 flex items-center gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3.5" aria-hidden="true" /> {post.likeCount}
                    <span className="sr-only">likes</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="size-3.5" aria-hidden="true" /> {post.commentCount}
                    <span className="sr-only">comments</span>
                  </span>
                </p>
              </li>
            ))}
        </ul>
      )}
    </Widget>
  );
}

export async function NotificationsSection() {
  const { viewer, db } = await session();
  const result = await attempt(() => listNotifications(db, viewer));
  return (
    <Widget title="Notifications" href="/notifications">
      {!result.ok ? (
        <WidgetError what="notifications" />
      ) : result.data.items.length === 0 ? (
        <p className="text-sm text-muted">You&apos;re all caught up.</p>
      ) : (
        <ul className="space-y-3">
          {result.data.items.slice(0, 5).map((n) => {
            const { text, href } = describeNotification(n);
            const inner = (
              <>
                <span className="block text-sm leading-5">{text}</span>
                <span className="text-xs text-muted">{formatRelative(n.createdAt)}</span>
              </>
            );
            return (
              <li key={n.id} className="flex gap-3">
                <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                {href ? (
                  <Link href={href} className="min-w-0 hover:text-accent">
                    {inner}
                  </Link>
                ) : (
                  <span className="min-w-0">{inner}</span>
                )}
                {!n.readAt ? <span className="sr-only">Unread</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

export async function MembershipSection() {
  const { viewer, db } = await session();
  const result = await attempt(() => getMembershipOverview(db, viewer));
  if (!result.ok) {
    return (
      <Widget title="Membership" href="/account/membership">
        <WidgetError what="your membership" />
      </Widget>
    );
  }
  const o = result.data;
  const planName = (id: string) => o.plans.find((p) => p.id === id)?.name ?? "Membership";
  const sub = o.subscriptions.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
  const grant = o.grants.find((g) => g.active);
  const pendingApp = o.applications.find((a) => a.status === "submitted" || a.status === "under_review");
  const pendingVerification = o.verifications.find((v) => v.status === "pending");

  return (
    <Widget title="Membership" href="/account/membership" hrefLabel="Manage">
      <div className="space-y-4">
        {sub ? (
          <div>
            <p className="display text-2xl">{planName(sub.planId)}</p>
            <p className="mt-1 text-xs text-muted">
              {sub.status === "past_due"
                ? "Payment overdue — update your billing details to keep access."
                : sub.cancelAtPeriodEnd && sub.currentPeriodEnd
                  ? `Ends ${formatDate(sub.currentPeriodEnd)}`
                  : sub.currentPeriodEnd
                    ? `Renews ${formatDate(sub.currentPeriodEnd)}`
                    : sub.status === "trialing"
                      ? "Trial"
                      : "Active"}
            </p>
          </div>
        ) : grant ? (
          <div>
            <p className="display text-2xl">{planName(grant.planId)}</p>
            <p className="mt-1 text-xs text-muted">Complimentary access until {formatDate(grant.expiresAt)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {pendingApp ? "Your application is being reviewed. We'll notify you as soon as there's a decision." : "Unlock messaging, private listings and premium discovery."}
            </p>
            {!pendingApp ? (
              <Button asChild size="sm">
                <Link href="/membership">Compare plans</Link>
              </Button>
            ) : null}
          </div>
        )}

        <div className="rule-gold" />

        <div>
          <p className="mb-2 text-xs text-muted">Verification</p>
          {viewer.verifiedKinds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {viewer.verifiedKinds.map((k) => (
                <Badge key={k} tone="accent">
                  <BadgeCheck className="size-3" aria-hidden="true" /> {VERIFICATION_LABELS[k]}
                </Badge>
              ))}
            </div>
          ) : pendingVerification ? (
            <p className="text-sm">Your verification is under review.</p>
          ) : (
            <Link href="/account/verification" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <ShieldCheck className="size-4" aria-hidden="true" /> Get verified to build trust
            </Link>
          )}
        </div>
      </div>
    </Widget>
  );
}

export async function MarketplaceSection() {
  const { viewer, db } = await session();
  const result = await attempt(() => browseListings(db, viewer, {}));
  if (result.ok && result.data.items.length === 0) return null;
  return (
    <Widget title="New in the marketplace" href="/luxury" hrefLabel="Explore">
      {!result.ok ? (
        <WidgetError what="listings" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {result.data.items.slice(0, 3).map((l) => (
            <li key={l.id}>
              <ListingCard listing={l} canSave={hasFeature(viewer, "luxury.view_members")} />
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

/** Role workspaces: each panel appears only for members who hold that role. */
export async function WorkspacesSection() {
  const { viewer, db } = await session();
  const showBusiness = viewer.hasApprovedBusiness || hasFeature(viewer, "business.manage");
  const showAds = hasFeature(viewer, "ads.manage");
  const showAdmin = isStaff(viewer, "moderator");
  if (!showBusiness && !showAds && !showAdmin) return null;

  const [listings, inquiries, campaigns, queues] = await Promise.all([
    showBusiness ? attempt(() => listOwnListings(db, viewer)) : null,
    showBusiness ? attempt(() => listReceivedInquiries(db, viewer)) : null,
    showAds ? attempt(() => listCampaigns(db, viewer)) : null,
    showAdmin ? attempt(() => queueCounts(db)) : null,
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {showBusiness ? (
        <Widget title="Business" href="/business" hrefLabel="Open workspace">
          <WorkspaceIcon icon={Building2} />
          {listings?.ok && inquiries?.ok ? (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Live listings" value={listings.data.filter((l) => l.status === "published").length} />
              <Mini label="In review" value={listings.data.filter((l) => l.status === "pending_review").length} />
              <Mini label="New enquiries" value={inquiries.data.filter((i) => i.status === "new").length} href="/business/inquiries" />
            </dl>
          ) : (
            <WidgetError what="your business activity" />
          )}
        </Widget>
      ) : null}
      {showAds ? (
        <Widget title="Advertising" href="/ads" hrefLabel="Open workspace">
          <WorkspaceIcon icon={Megaphone} />
          {campaigns?.ok ? (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Active" value={campaigns.data.filter((c) => c.status === "active").length} />
              <Mini label="In review" value={campaigns.data.filter((c) => c.status === "pending_review").length} />
              <Mini label="Drafts" value={campaigns.data.filter((c) => c.status === "draft").length} />
            </dl>
          ) : (
            <WidgetError what="your campaigns" />
          )}
        </Widget>
      ) : null}
      {showAdmin ? (
        <Widget title="Administration" href="/admin" hrefLabel="Open console">
          <WorkspaceIcon icon={Inbox} />
          {queues?.ok ? (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Applications" value={queues.data.applications} href="/admin/applications" />
              <Mini label="Verifications" value={queues.data.verifications} href="/admin/verifications" />
              <Mini label="Reports" value={queues.data.reports} href="/admin/reports" />
            </dl>
          ) : (
            <WidgetError what="review queues" />
          )}
        </Widget>
      ) : null}
    </div>
  );
}

function WorkspaceIcon({ icon: Icon }: { icon: typeof Sparkles }) {
  return <Icon className="mb-3 size-5 text-accent" aria-hidden="true" />;
}

function Mini({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="display text-2xl tabular-nums">{value}</dd>
    </>
  );
  return href ? (
    <Link href={href} className="flex flex-col-reverse rounded-lg py-2 hover:bg-surface-2">
      {inner}
    </Link>
  ) : (
    <div className="flex flex-col-reverse py-2">{inner}</div>
  );
}
