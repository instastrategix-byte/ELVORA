import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/events/event-form";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { getEvent } from "@backend/modules/events/service";
import { getOwnBusiness } from "@backend/modules/listings/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/events/${id}/edit` });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const result = await attempt(() => getEvent(db, viewer, id));
  if (!result.ok) return <ServiceNotice error={result.error} what="this event" />;
  const event = result.data;
  if (!event || !event.isHost) notFound();
  const business = viewer.hasApprovedBusiness ? await getOwnBusiness(db, viewer).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Edit event" title={event.title} />
      <EventForm event={event} business={business?.status === "approved" ? { id: business.id, name: business.name } : null} />
    </div>
  );
}
