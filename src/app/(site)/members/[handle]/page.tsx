import { Award, Briefcase, Lock, MapPin, Pencil, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PostList } from "@/components/feed/post-list";
import { PlatformIcon } from "@/components/profile/platform-icons";
import { BusinessCardActions, ProfileViewBeacon, RequestIntroductionButton } from "@/components/profile/profile-extras";
import { ProfileActions } from "@/components/social/profile-actions";
import { Button } from "@/components/ui/button";
import { experienceRange } from "@/components/profile/experience-format";
import { Alert, Avatar, Badge, Card, Skeleton } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { attempt } from "@/lib/attempt";
import { formatDate, titleCase } from "@/lib/format";
import { createClient } from "@backend/db/server";
import { hasFeature } from "@backend/modules/auth/permissions";
import { listAuthorPosts } from "@backend/modules/feed/service";
import { PLATFORMS, linkDisplay } from "@backend/modules/profiles/links";
import { getProfileByHandle, getRelationship } from "@backend/modules/profiles/service";
import { MEMBER_TYPE_LABELS, OPEN_TO_LABELS, type ProfileDetail } from "@backend/modules/profiles/types";
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
              <>
                <ProfileActions userId={profile.id} displayName={profile.displayName} relationship={relationship} canConnect={canConnect} />
                {canConnect && relationship.connection?.status !== "accepted" && !relationship.blocked ? (
                  <RequestIntroductionButton targetId={profile.id} targetName={profile.displayName} />
                ) : null}
              </>
            ) : !viewerIsMember ? (
              <Button asChild>
                <Link href={`/sign-in?next=/members/${profile.handle}`}>Sign in to connect</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-5">
            <section aria-label="Profile summary" className="space-y-4">
              <div>
                {profile.memberType ? <p className="eyebrow">{MEMBER_TYPE_LABELS[profile.memberType]}</p> : null}
                <h1 className="display mt-1 flex flex-wrap items-center gap-2 text-4xl">{profile.displayName}</h1>
                <p className="text-sm text-muted">@{profile.handle}</p>
                <div className="mt-2">
                  <VerifiedBadges kinds={profile.verifiedKinds} business={profile.hasApprovedBusiness} />
                </div>
              </div>
              {profile.headline ? <p className="text-lg">{profile.headline}</p> : null}
              <BusinessCardActions handle={profile.handle} displayName={profile.displayName} />
              {viewerIsMember && !isSelf ? <ProfileViewBeacon profileId={profile.id} /> : null}
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
                <li>Member since {formatDate(profile.memberSince)}</li>
              </ul>
              <SocialLinks links={profile.links} />
              {isSelf ? (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="size-3.5" aria-hidden="true" /> Visible to: {titleCase(profile.profileVisibility)}.{" "}
                  <Link href="/account/settings" className="text-accent hover:underline">
                    Change
                  </Link>
                </p>
              ) : null}
            </section>

            {profile.openTo.length ? (
              <Card className="p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-accent" aria-hidden="true" /> Open to
                </h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {profile.openTo.map((o) => (
                    <li key={o}>
                      <Badge tone="accent">{OPEN_TO_LABELS[o]}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {profile.bio ? (
              <ProfileSection title="About">
                <p className="text-sm leading-7 whitespace-pre-line">{profile.bio}</p>
              </ProfileSection>
            ) : null}

            {profile.experiences.length ? (
              <ProfileSection title="Experience">
                <ol className="relative space-y-5 border-l border-border pl-5">
                  {profile.experiences.map((e) => (
                    <li key={e.id} className="relative">
                      <span aria-hidden="true" className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-bg bg-accent" />
                      <p className="font-medium">{e.title}</p>
                      <p className="text-sm text-muted">
                        {e.company}
                        {e.location ? ` · ${e.location}` : ""}
                      </p>
                      <p className="text-xs text-muted">{experienceRange(e)}</p>
                      {e.description ? <p className="mt-2 text-sm leading-6 whitespace-pre-line">{e.description}</p> : null}
                    </li>
                  ))}
                </ol>
              </ProfileSection>
            ) : null}

            {profile.skills.length ? (
              <ProfileSection title="Skills and expertise">
                <ul className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <li key={skill}>
                      <Badge>{skill}</Badge>
                    </li>
                  ))}
                </ul>
              </ProfileSection>
            ) : null}

            {profile.achievements.length ? (
              <ProfileSection title="Achievements">
                <ul className="space-y-2 text-sm">
                  {profile.achievements.map((a) => (
                    <li key={a} className="flex gap-2">
                      <Award className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" /> {a}
                    </li>
                  ))}
                </ul>
              </ProfileSection>
            ) : null}

            {profile.interests.length ? (
              <ProfileSection title="Interests">
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((i) => (
                    <Badge key={i}>{titleCase(i)}</Badge>
                  ))}
                </div>
              </ProfileSection>
            ) : null}

            {isSelf && !profile.experiences.length && !profile.skills.length ? (
              <Alert tone="info">
                Add your experience and skills so members know what you do.{" "}
                <Link href="/profile/edit" className="text-accent hover:underline">
                  Complete your profile
                </Link>
              </Alert>
            ) : null}
          </div>

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

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function SocialLinks({ links }: { links: ProfileDetail["links"] }) {
  // `links` already contains only what this viewer may see (RLS on profile_links).
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Links">
      {links.map((link) => {
        const name = link.platform === "other" ? (link.label ?? "Link") : PLATFORMS[link.platform].label;
        const shown = linkDisplay(link.url);
        return (
          <li key={link.id}>
            <a
              href={link.url}
              rel="noopener noreferrer nofollow me"
              target="_blank"
              title={`${name}: ${shown}`}
              aria-label={`${name}: ${shown} (opens in a new tab)`}
              className="group inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-muted transition-[color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent hover:text-accent focus-visible:border-accent"
            >
              <PlatformIcon platform={link.platform} size={18} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
