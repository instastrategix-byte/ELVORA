import type { Metadata } from "next";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ProfileForm } from "@/components/forms/profile-form";
import { ExperienceEditor } from "@/components/profile/experience-editor";
import { LinksEditor } from "@/components/profile/links-editor";
import { Card, PageHeader } from "@/components/ui/primitives";
import { publicMediaUrl } from "@/lib/media";
import { getOwnProfile, listExperiences, listLinks } from "@backend/modules/profiles/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const { viewer, db } = await requirePageSession({ next: "/profile/edit" });
  let p;
  let experiences;
  let links;
  try {
    [p, experiences, links] = await Promise.all([getOwnProfile(db, viewer), listExperiences(db, viewer.id), listLinks(db, viewer.id)]);
  } catch (error) {
    return <ServiceNotice error={error} what="your profile" />;
  }
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Edit profile" description="Verification badges and account status are managed by ELVORA and can't be edited here." />
      <ProfileForm
        initial={{
          handle: p.handle,
          displayName: p.display_name,
          headline: p.headline,
          bio: p.bio,
          jobTitle: p.job_title,
          company: p.company,
          industry: p.industry,
          location: p.location,
          interests: p.interests,
          memberType: p.member_type,
          skills: p.skills,
          openTo: p.open_to,
          achievements: p.achievements,
          avatarUrl: publicMediaUrl("profile-media", p.avatar_path),
          coverUrl: publicMediaUrl("profile-media", p.cover_path),
        }}
      />
      <Card className="p-6">
        <LinksEditor initial={links} />
      </Card>
      <ExperienceEditor initial={experiences} />
    </div>
  );
}
