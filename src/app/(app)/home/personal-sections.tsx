import { CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Meter, Widget, WidgetError } from "@/components/dashboard/widgets";
import { EventRow } from "@/components/events/event-row";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";
import { canHostEvents, listUpcomingForDashboard } from "@backend/modules/events/service";
import { profileCompleteness } from "@backend/modules/profiles/completeness";
import { getOwnProfileDetail } from "@backend/modules/profiles/service";
import { requirePageSession } from "@backend/auth/viewer";

const session = () => requirePageSession({ next: "/home" });

/** Profile strength. Hidden once the profile is complete, so it never nags finished members. */
export async function SetupSection() {
  const { viewer, db } = await session();
  const result = await attempt(() => getOwnProfileDetail(db, viewer));
  if (!result.ok) return null;
  const { percent, missing } = profileCompleteness(result.data);
  if (missing.length === 0) return null;
  return (
    <section aria-labelledby="setup-h" className="panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="md:w-64 md:shrink-0">
          <h2 id="setup-h" className="text-sm font-semibold tracking-wide">
            Profile strength
          </h2>
          <p className="display mt-1 text-3xl tabular-nums">{percent}%</p>
          <Meter value={percent} label="Profile completeness" />
          <p className="mt-2 text-xs text-muted">Complete profiles appear higher in discovery and get more introductions.</p>
        </div>
        <ul className="grid flex-1 gap-2 sm:grid-cols-2">
          {missing.slice(0, 4).map((m) => (
            <li key={m.key}>
              <Link
                href={m.href}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:border-accent/60"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-muted" aria-hidden="true" /> {m.label}
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

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
