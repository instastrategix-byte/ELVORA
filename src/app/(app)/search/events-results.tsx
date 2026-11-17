import type { ReactNode } from "react";
import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { EventRow } from "@/components/events/event-row";
import { attempt } from "@/lib/attempt";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { searchEvents } from "@backend/modules/events/service";

/** Event results for /search, returned with a count so the page can tell "nothing found" apart. */
export async function searchEventsSection(
  db: DbClient,
  viewer: Viewer,
  q: string,
  limit: number,
): Promise<{ count: number; failed: boolean; node: ReactNode }> {
  const result = await attempt(() => searchEvents(db, viewer, q, limit));
  if (!result.ok) {
    return {
      count: 0,
      failed: true,
      node: (
        <Widget title="Events">
          <WidgetError what="events" />
        </Widget>
      ),
    };
  }
  if (result.data.length === 0) return { count: 0, failed: false, node: null };
  return {
    count: result.data.length,
    failed: false,
    node: (
      <Widget title="Events" href={`/search?q=${encodeURIComponent(q)}&type=events`} hrefLabel="All events">
        <ul className="grid gap-5 sm:grid-cols-2">
          {result.data.map((e) => (
            <li key={e.id}>
              <EventRow event={e} />
            </li>
          ))}
        </ul>
      </Widget>
    ),
  };
}
