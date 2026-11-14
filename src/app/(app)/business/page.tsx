import { Inbox, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessForm, SubmitBusinessButton } from "@/components/business/business-form";
import { MembershipRequired } from "@/components/business/upsell";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { StatusBadge } from "@/components/membership/status-badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { hasFeature } from "@backend/modules/auth/permissions";
import { CATEGORY_LABELS } from "@backend/modules/listings/schemas";
import { getOwnBusiness, listOwnListings } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Business" };

const STATUS_COPY = {
  draft: "Complete your profile and documents, then submit for verification.",
  pending_review: "Our team is reviewing your business. You'll be notified of the decision.",
  approved: "Your business is verified. Listings can be submitted for publication.",
  rejected: "Verification was not approved. Review the note, update your details and resubmit.",
  suspended: "Your business is suspended. Listings are hidden while suspended.",
} as const;

export default async function BusinessPage() {
  const { viewer, db } = await requirePageSession({ next: "/business" });
  const canManage = hasFeature(viewer, "business.manage");

  let data;
  try {
    const business = await getOwnBusiness(db, viewer);
    data = { business, listings: business ? await listOwnListings(db, viewer) : [] };
  } catch (error) {
    return <ServiceNotice error={error} what="your business" />;
  }
  const { business, listings } = data;

  if (!canManage && !business) {
    return (
      <div>
        <PageHeader eyebrow="Business" title="Grow with ELVORA" />
        <MembershipRequired
          title="A Luxury Business membership is required"
          body="Hotels, villas, yacht and automotive specialists, event houses and experience curators can apply to create a verified business profile and publish listings."
          plan="business"
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Business"
        title={business?.name ?? "Create your business profile"}
        actions={
          business ? (
            <>
              <Button asChild variant="outline">
                <Link href="/business/inquiries">
                  <Inbox /> Inquiries
                </Link>
              </Button>
              {business.status === "approved" ? (
                <Button asChild>
                  <Link href="/business/listings/new">
                    <Plus /> New listing
                  </Link>
                </Button>
              ) : (
                <Button disabled title="Available once your business is verified">
                  <Plus /> New listing
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {business ? (
        <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              Verification status <StatusBadge status={business.status} label={business.status === "approved" ? "Verified" : undefined} />
            </p>
            <p className="text-sm text-muted">{STATUS_COPY[business.status]}</p>
            {business.reviewNote && business.status === "rejected" ? <p className="text-sm">Reviewer note: {business.reviewNote}</p> : null}
          </div>
          {business.status === "draft" || business.status === "rejected" ? (
            <SubmitBusinessButton businessId={business.id} disabled={!canManage || business.evidencePaths.length === 0} />
          ) : null}
        </Card>
      ) : null}
      {business && (business.status === "draft" || business.status === "rejected") && business.evidencePaths.length === 0 ? (
        <Alert tone="info">Upload verification documents below before submitting.</Alert>
      ) : null}
      {!canManage && business ? (
        <Alert tone="warning" title="Your Luxury Business membership is not active">Listings stay unpublished until the membership is active again.</Alert>
      ) : null}

      <section>
        <h2 className="display mb-4 text-3xl">Business profile</h2>
        <Card className="p-6">
          <BusinessForm business={business} />
        </Card>
      </section>

      {business ? (
        <section>
          <h2 className="display mb-4 text-3xl">Listings</h2>
          {listings.length ? (
            <Card className="divide-y divide-border">
              {listings.map((l) => (
                <div key={l.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/business/listings/${l.id}`} className="font-medium hover:text-accent">
                      {l.title}
                    </Link>
                    <p className="text-sm text-muted">
                      {CATEGORY_LABELS[l.category]} · {l.visibility === "members" ? "Members only" : "Public"}
                      {l.publishedAt ? ` · Published ${formatDate(l.publishedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={l.status} />
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/business/listings/${l.id}`}>Manage</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState
              title="No listings yet"
              description={business.status === "approved" ? "Create your first listing and submit it for review." : "You can create listings once your business is verified."}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
