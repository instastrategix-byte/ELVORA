import { CalendarDays, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/events/event-card";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { cn } from "@/lib/utils";
import { canHostEvents, listUpcomingEvents, type EventFilter } from "@backend/modules/events/service";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Events" };

const TABS: { key: EventFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "mine", label: "My events" },
  { key: "hosting", label: "Hosting" },
];

const EMPTY: Record<EventFilter, { title: string; description: string }> = {
  upcoming: { title: "No upcoming events yet", description: "Private dinners, salons and briefings hosted by verified members will appear here." },
  mine: { title: "Nothing on your calendar", description: "Events you attend, follow or are invited to will appear here." },
  hosting: { title: "You aren't hosting anything yet", description: "Create a draft, invite guests and publish when you're ready." },
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, db } = await requirePageSession({ next: "/events" });
  const sp = await searchParams;
  const canHost = canHostEvents(viewer);
  const requested = TABS.find((t) => t.key === sp.filter)?.key ?? "upcoming";
  const filter: EventFilter = requested === "hosting" && !canHost ? "upcoming" : requested;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : undefined;
  const result = await attempt(() => listUpcomingEvents(db, viewer, { filter, cursor }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Private calendar"
        title="Events"
        description="Members-only gatherings hosted by verified executives, public figures and businesses."
        actions={
          canHost ? (
            <Button asChild>
              <Link href="/events/new">
                <Plus aria-hidden="true" /> Host an event
              </Link>
            </Button>
          ) : null
        }
      />
      <nav aria-label="Event lists" className="mb-6 flex w-fit rounded-full border border-border p-1 text-sm">
        {TABS.filter((t) => t.key !== "hosting" || canHost).map((t) => (
          <Link
            key={t.key}
            href={t.key === "upcoming" ? "/events" : `/events?filter=${t.key}`}
            aria-current={filter === t.key ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5", filter === t.key ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {!result.ok ? (
        <ServiceNotice error={result.error} what="events" />
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={EMPTY[filter].title}
          description={canHost || filter !== "hosting" ? EMPTY[filter].description : undefined}
          action={
            canHost && filter !== "upcoming" ? (
              <Button asChild>
                <Link href="/events/new">Host an event</Link>
              </Button>
            ) : !canHost && filter === "upcoming" ? (
              <p className="text-xs text-muted">Hosting opens to members with a verified executive or public-figure badge, or a verified business.</p>
            ) : null
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {result.data.items.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
          {result.data.nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Button asChild variant="outline">
                <Link href={`/events?cursor=${encodeURIComponent(result.data.nextCursor)}`}>Later events</Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
