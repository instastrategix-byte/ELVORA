import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ListingForm, ListingGallery, ListingStatusActions } from "@/components/business/listing-form";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, PageHeader } from "@/components/ui/primitives";
import { getListingById } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Manage listing" };

const LIFECYCLE: Record<string, string> = {
  draft: "Draft — only you can see it.",
  pending_review: "Under review by the ELVORA team.",
  published: "Live in the marketplace.",
  rejected: "Not approved. Review the note, edit and resubmit.",
  archived: "Unpublished. Republish anytime if unchanged since approval.",
  removed: "Removed by moderation. Contact support for details.",
};

export default async function ManageListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/business/listings/${id}` });
  if (!z.uuid().safeParse(id).success) notFound();
  let listing;
  try {
    listing = await getListingById(db, viewer, id);
  } catch (error) {
    return <ServiceNotice error={error} what="this listing" />;
  }
  if (!listing || !listing.isOwner) notFound();

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Listing"
        title={listing.title}
        actions={
          listing.status === "published" ? (
            <Button asChild variant="outline">
              <Link href={`/luxury/${listing.slug}`}>
                View live <ExternalLink />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card className="space-y-4 p-6">
        <p className="flex items-center gap-2 font-medium">
          Status <StatusBadge status={listing.status} />
        </p>
        <p className="text-sm text-muted">{LIFECYCLE[listing.status]}</p>
        {listing.reviewNote && listing.status === "rejected" ? <Alert tone="warning" title="Reviewer note">{listing.reviewNote}</Alert> : null}
        {listing.status !== "removed" ? <ListingStatusActions listing={listing} /> : null}
      </Card>
      {listing.status !== "removed" ? (
        <>
          <ListingForm listing={listing} />
          <section>
            <h2 className="display mb-4 text-3xl">Gallery</h2>
            <Card className="p-6">
              <ListingGallery listing={listing} />
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
