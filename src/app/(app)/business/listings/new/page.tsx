import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/business/listing-form";
import { MembershipRequired } from "@/components/business/upsell";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { hasFeature } from "@backend/modules/auth/permissions";
import { getOwnBusiness } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  const { viewer, db } = await requirePageSession({ next: "/business/listings/new" });
  if (!hasFeature(viewer, "business.manage")) {
    return (
      <MembershipRequired title="A Luxury Business membership is required" body="Apply for a Luxury Business membership to create listings." plan="business" />
    );
  }
  let business;
  try {
    business = await getOwnBusiness(db, viewer);
  } catch (error) {
    return <ServiceNotice error={error} what="your business" />;
  }
  if (!business) {
    return (
      <Alert tone="info" title="Create your business profile first" action={<Button asChild size="sm"><Link href="/business">Go to business profile</Link></Button>}>
        Listings belong to a verified business.
      </Alert>
    );
  }
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow={business.name} title="New listing" description="Listings start as drafts. Submit for review when ready; approved listings go live." />
      <ListingForm />
    </div>
  );
}
