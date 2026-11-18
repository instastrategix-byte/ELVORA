import type { Metadata } from "next";
import { CommunityForm } from "@/components/communities/community-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Create a community", robots: { index: false } };

export default async function NewCommunityPage() {
  const { viewer } = await requirePageSession({ next: "/communities/new" });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Communities" title="Create a community" description="You'll be its owner. You can appoint moderators once members join." />
      {hasFeature(viewer, "feed.post") ? (
        <CommunityForm />
      ) : (
        <Alert tone="info">Creating communities isn&apos;t included in your current membership.</Alert>
      )}
    </div>
  );
}
