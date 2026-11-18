import type { Metadata } from "next";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Post an opportunity", robots: { index: false } };

export default async function NewOpportunityPage() {
  const { viewer } = await requirePageSession({ next: "/opportunities/new" });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Opportunities" title="Post an opportunity" description="Members respond privately. You decide who to shortlist and message." />
      {hasFeature(viewer, "feed.post") ? (
        <OpportunityForm />
      ) : (
        <Alert tone="info">Posting opportunities isn&apos;t included in your current membership.</Alert>
      )}
    </div>
  );
}
