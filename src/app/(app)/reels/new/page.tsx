import type { Metadata } from "next";
import { MembershipRequired } from "@/components/business/upsell";
import { ReelUploader } from "@/components/reels/reel-uploader";
import { PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Create a reel" };

export default async function NewReelPage() {
  const { viewer } = await requirePageSession({ next: "/reels/new" });
  return (
    <div>
      <PageHeader eyebrow="Reels" title="Create a reel" description="Share a short vertical video, up to 90 seconds." />
      {hasFeature(viewer, "feed.post") ? (
        <ReelUploader />
      ) : (
        <MembershipRequired title="Posting requires an active membership" body="Members with posting access can share reels." plan="member" />
      )}
    </div>
  );
}
