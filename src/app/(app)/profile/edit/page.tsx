import type { Metadata } from "next";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { ProfileForm } from "@/components/forms/profile-form";
import { PageHeader } from "@/components/ui/primitives";
import { publicMediaUrl } from "@/lib/media";
import { getOwnProfile } from "@backend/modules/profiles/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Edit profile" };

export default async function EditProfilePage() {
  const { viewer, db } = await requirePageSession({ next: "/profile/edit" });
  let p;
  try {
    p = await getOwnProfile(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="your profile" />;
  }
  return (
    <div className="max-w-3xl">
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
          website: p.website,
          interests: p.interests,
          avatarUrl: publicMediaUrl("profile-media", p.avatar_path),
          coverUrl: publicMediaUrl("profile-media", p.cover_path),
        }}
      />
    </div>
  );
}
