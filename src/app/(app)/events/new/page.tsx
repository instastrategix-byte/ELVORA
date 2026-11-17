import type { Metadata } from "next";
import { EventForm } from "@/components/events/event-form";
import { Alert, PageHeader } from "@/components/ui/primitives";
import { getOwnBusiness } from "@backend/modules/listings/service";
import { canHostEvents } from "@backend/modules/events/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Host an event" };

export default async function NewEventPage() {
  const { viewer, db } = await requirePageSession({ next: "/events/new" });
  if (!canHostEvents(viewer)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Host an event" />
        <Alert tone="info" title="Hosting requires verification">
          Events can be hosted by verified executives, verified public figures and verified businesses. Request verification from your account
          settings, or register your business.
        </Alert>
      </div>
    );
  }
  const business = viewer.hasApprovedBusiness ? await getOwnBusiness(db, viewer).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="New event" title="Host an event" description="Events start as drafts. Publish when the details are final." />
      <EventForm business={business?.status === "approved" ? { id: business.id, name: business.name } : null} />
    </div>
  );
}
