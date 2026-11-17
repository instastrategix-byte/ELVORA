import Link from "next/link";
import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { EventRow } from "@/components/events/event-row";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";
import { canHostEvents, listUpcomingForDashboard } from "@backend/modules/events/service";
import { requirePageSession } from "@backend/auth/viewer";

const session = () => requirePageSession({ next: "/home" });

/** Upcoming events the member is attending first, then others they can join. */
export async function EventsSection() {
  const { viewer, db } = await session();
  const result = await attempt(() => listUpcomingForDashboard(db, viewer, 3));
  return (
    <Widget title="Upcoming events" href="/events" hrefLabel="All events">
      {!result.ok ? (
        <WidgetError what="events" />
      ) : result.data.length === 0 ? (
        <div className="space-y-3 text-sm text-muted">
          <p>No upcoming private events yet.</p>
          {canHostEvents(viewer) ? (
            <Button asChild size="sm">
              <Link href="/events/new">Host an event</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-5">
          {result.data.map((e) => (
            <li key={e.id}>
              <EventRow event={e} />
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
