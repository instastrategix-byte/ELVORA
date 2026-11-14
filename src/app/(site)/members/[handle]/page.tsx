import { Briefcase, Globe, Lock, MapPin, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostList } from "@/components/feed/post-list";
import { ProfileActions } from "@/components/social/profile-actions";
import { Button } from "@/components/ui/button";
import { Alert, Avatar, Badge, Skeleton } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { attempt } from "@/lib/attempt";
import { formatDate, titleCase } from "@/lib/format";
import { createClient } from "@backend/db/server";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listAuthorPosts } from "@backend/modules/feed/service";
import { getProfileByHandle, getRelationship } from "@backend/modules/profiles/service";
import { getSession } from "@backend/auth/viewer";

type Params = Promise<{ handle: string }>;

/** Title comes from a visibility-checked read, so private profiles never leak their name. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  const result = await attempt(async () => {
    const session = await getSession();
    return getProfileByHandle(session?.db ?? (await createClient()), handle);
  });
  const profile = result.ok ? result.data : null;
  return {
    title: profile ? profile.displayName : "Member profile",
    description: profile?.headline ?? undefined,
    robots: { index: profile?.profileVisibility === "public" },
  };
}

export default function MemberPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="mt-6 h-40 rounded-2xl" />
        </div>
      }
    >
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: { params: Params }) {
  const { handle } = await params;
  let data;
  try {
    const session = await getSession();
    const db = session?.db ?? (await createClient());
    const viewer = session?.viewer ?? null;
    const profile = await getProfileByHandle(db, handle);
    if (!profile) {
      data = null;
    } else {
      const isSelf = viewer?.id === profile.id;
      const viewerIsMember = Boolean(viewer?.onboarded && viewer.accountStatus === "active");
      const [relationship, posts] = await Promise.all([
        viewer && viewerIsMember && !isSelf ? getRelationship(db, viewer, profile.id) : Promise.resolve(null),
        listAuthorPosts(db, viewer, profile.id),
      ]);
      data = { profile, isSelf, viewerIsMember, relationship, posts, canConnect: hasFeature(viewer, "connections.request") };
    }
  } catch (error) {
    return (
      <div className="container-page py-10">
        <ServiceNotice error={error} what="this profile" />
      </div>
    );
  }
  // Private profiles are indistinguishable from missing ones (RLS returns no row).
  if (!data) notFound();
  const { profile, isSelf, viewerIsMember, relationship, posts, canConnect } = data;

  return (
    <div className="pb-10">
      <div className="relative h-44 border-b border-border sm:h-60">
        {profile.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- member-uploaded cover image
          <img src={profile.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_65%)] bg-surface" />
        )}
      </div>
      <div className="container-page">
        <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={120} className="ring-4 ring-bg" />
          <div className="flex flex-wrap gap-2">
            {isSelf ? (
              <Button asChild variant="outline">
                <Link href="/profile/edit">
                  <Pencil /> Edit profile
                </Link>
              </Button>
            ) : relationship ? (
              <ProfileActions userId={profile.id} displayName={profile.displayName} relationship={relationship} canConnect={canConnect} />
            ) : !viewerIsMember ? (
              <Button asChild>
                <Link href={`/sign-in?next=/members/${profile.handle}`}>Sign in to connect</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <section aria-label="About" className="space-y-5">
            <div>
              <h1 className="display flex flex-wrap items-center gap-2 text-4xl">{profile.displayName}</h1>
              <p className="text-sm text-muted">@{profile.handle}</p>
              <div className="mt-2">
                <VerifiedBadges kinds={profile.verifiedKinds} business={profile.hasApprovedBusiness} />
              </div>
            </div>
            {profile.headline ? <p className="text-lg">{profile.headline}</p> : null}
            <ul className="space-y-2 text-sm text-muted">
              {profile.jobTitle || profile.company ? (
                <li className="flex items-center gap-2">
                  <Briefcase className="size-4" aria-hidden="true" /> {[profile.jobTitle, profile.company].filter(Boolean).join(" · ")}
                </li>
              ) : null}
              {profile.location ? (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4" aria-hidden="true" /> {profile.location}
                </li>
              ) : null}
              {profile.website ? (
                <li className="flex items-center gap-2">
                  <Globe className="size-4" aria-hidden="true" />
                  <a href={profile.website} rel="noopener noreferrer nofollow" target="_blank" className="text-accent hover:underline">
                    {profile.website.replace(/^https:\/\//, "")}
                  </a>
                </li>
              ) : null}
              <li>Member since {formatDate(profile.memberSince)}</li>
            </ul>
            {profile.bio ? <p className="text-sm leading-7 whitespace-pre-line">{profile.bio}</p> : null}
            {profile.interests.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((i) => (
                  <Badge key={i}>{titleCase(i)}</Badge>
                ))}
              </div>
            ) : null}
            {isSelf ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Lock className="size-3.5" aria-hidden="true" /> Visible to: {titleCase(profile.profileVisibility)}.{" "}
                <Link href="/account/settings" className="text-accent hover:underline">
                  Change
                </Link>
              </p>
            ) : null}
          </section>

          <section aria-label="Posts">
            <h2 className="display mb-4 text-2xl">Posts</h2>
            {!viewerIsMember ? (
              <Alert tone="info" className="mb-4">
                You&apos;re seeing public posts only.
              </Alert>
            ) : null}
            <PostList
              initial={posts}
              endpoint={`/api/v1/members/${profile.id}/posts`}
              canInteract={viewerIsMember}
              emptyTitle="No posts to show"
              emptyDescription={isSelf ? "Share your first update from your feed." : "Posts you're allowed to see will appear here."}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
