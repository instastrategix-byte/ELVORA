import { MapPin, Video } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import type { EventCard } from "@backend/modules/events/types";

const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en", { day: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

/** Compact event line with a date tile; used by the dashboard and search. */
export function EventRow({ event }: { event: EventCard }) {
  const start = new Date(event.startsAt);
  const place = event.format === "virtual" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ") || "Location shared with guests";
  return (
    <Link href={`/events/${event.id}`} className="group flex items-start gap-4 rounded-xl p-2 -m-2 transition-colors hover:bg-surface-2">
      <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-border bg-surface py-1.5" aria-hidden="true">
        <span className="text-[10px] font-medium tracking-widest text-accent uppercase">{MONTH.format(start)}</span>
        <span className="display text-xl leading-none">{DAY.format(start)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium group-hover:text-accent">{event.title}</span>
        <span className="mt-0.5 block text-xs text-muted">
          <time dateTime={event.startsAt}>{TIME.format(start)}</time>
        </span>
        <span className="mt-1 flex items-center gap-1 text-xs text-muted">
          {event.format === "virtual" ? <Video className="size-3" aria-hidden="true" /> : <MapPin className="size-3" aria-hidden="true" />}
          <span className="truncate">{place}</span>
        </span>
      </span>
      {event.myRsvp === "going" ? (
        <Badge tone="success">Going</Badge>
      ) : event.myRsvp === "waitlisted" ? (
        <Badge tone="warning">Waitlist</Badge>
      ) : event.isHost ? (
        <Badge tone="accent">Hosting</Badge>
      ) : null}
    </Link>
  );
}
