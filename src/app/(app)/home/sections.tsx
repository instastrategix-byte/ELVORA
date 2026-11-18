import { BadgeCheck, Building2, Gem, Inbox, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { MemberLink } from "@/components/social/member-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate, titleCase } from "@/lib/format";
import { queueCounts } from "@backend/modules/admin/service";
import { listCampaigns } from "@backend/modules/ads/service";
import { hasFeature, isStaff, VERIFICATION_LABELS } from "@backend/modules/auth/permissions";
import { suggestMembers } from "@backend/modules/discovery/service";
import { listTrendingTags } from "@backend/modules/feed/service";
import { browseListings, listOwnListings, listReceivedInquiries } from "@backend/modules/listings/service";
import { getMembershipOverview } from "@backend/modules/membership/service";
import { requirePageSession } from "@backend/auth/viewer";

const session = () => requirePageSession({ next: "/home" });

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
        <ul className="space-y-3">
          {result.data.items.slice(0, 3).map((l) => (
            <li key={l.id}>
              <Link href={`/luxury/${l.slug}`} className="group flex items-center gap-3 rounded-xl p-1.5 -m-1.5 hover:bg-surface-2">
                <span className="size-14 shrink-0 overflow-hidden rounded-lg bg-surface-3">
                  {l.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- listing media from storage
                    <img src={l.coverUrl} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <Gem className="m-auto mt-4 size-5 text-muted" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium group-hover:text-accent">{l.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {[l.city, l.country].filter(Boolean).join(", ") || titleCase(l.category)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                    {l.business.verified ? <BadgeCheck className="size-3 text-accent" aria-hidden="true" /> : null}
                    {l.business.name}
                    {l.business.verified ? <span className="sr-only">(verified business)</span> : null}
                  </span>
                </span>
              </Link>
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
    <div className="space-y-4">
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

/** Hashtags trending this week across posts every member can see. Hidden when nothing is trending. */
export async function TrendingSection() {
  const { db } = await session();
  const result = await attempt(() => listTrendingTags(db, 8));
  if (result.ok && result.data.length === 0) return null;
  return (
    <Widget title="Trending this week" href="/search?type=posts" hrefLabel="Search posts">
      {!result.ok ? (
        <WidgetError what="trending topics" />
      ) : (
        <ol className="space-y-1">
          {result.data.map((t, i) => (
            <li key={t.tag}>
              <Link
                href={`/search?type=posts&q=${encodeURIComponent(`#${t.tag}`)}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <span className="w-4 text-right text-xs tabular-nums text-muted" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">#{t.tag}</span>
                <span className="text-xs text-muted">
                  {t.postCount} {t.postCount === 1 ? "post" : "posts"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Widget>
  );
}
