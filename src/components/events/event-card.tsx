import { CalendarDays, Lock, MapPin, Users, Video } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { FORMAT_LABELS } from "@backend/modules/events/schemas";
import type { EventCard as EventCardData, RsvpStatus } from "@backend/modules/events/types";

const DAY = new Intl.DateTimeFormat("en", { day: "numeric" });
const MONTH = new Intl.DateTimeFormat("en", { month: "short" });
const WHEN = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
const TIME = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

/** "Fri 20 Nov, 19:00 – 22:00 UTC" (end date shown when it differs). */
export function formatEventRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  return `${WHEN.format(start)} – ${sameDay ? TIME.format(end) : WHEN.format(end)}`;
}

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  invited: "Invited",
  interested: "Interested",
  going: "Going",
  waitlisted: "Waitlisted",
  cancelled: "Not going",
};

export function eventPlace(e: Pick<EventCardData, "format" | "venueName" | "city" | "country">): string {
  if (e.format === "virtual") return "Online";
  const place = [e.venueName, e.city, e.country].filter(Boolean).join(", ");
  return e.format === "hybrid" ? `${place || "Venue TBA"} · Online` : place || "Venue TBA";
}

export function EventCard({ event, className }: { event: EventCardData; className?: string }) {
  const start = new Date(event.startsAt);
  const full = event.capacity !== null && event.goingCount >= event.capacity;
  return (
    <Link href={`/events/${event.id}`} className={cn("panel-interactive group flex gap-4 p-4 sm:p-5", className)}>
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-surface-2 py-2 text-center">
        <span className="eyebrow text-[10px] tracking-[0.18em]">{MONTH.format(start)}</span>
        <span className="display text-2xl leading-none tabular-nums">{DAY.format(start)}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {event.status !== "published" ? <Badge tone={event.status === "cancelled" ? "danger" : "warning"}>{event.status === "draft" ? "Draft" : "Cancelled"}</Badge> : null}
          {event.visibility === "invite_only" ? (
            <Badge>
              <Lock className="size-3" aria-hidden="true" /> Invite only
            </Badge>
          ) : null}
          {event.myRsvp && event.myRsvp !== "cancelled" ? <Badge tone="accent">{RSVP_LABELS[event.myRsvp]}</Badge> : null}
          {event.isHost ? <Badge tone="accent">Hosting</Badge> : null}
        </div>
        <h3 className="truncate text-base font-medium group-hover:text-accent">{event.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
          <time dateTime={event.startsAt}>{formatEventRange(event.startsAt, event.endsAt)}</time>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          {event.format === "virtual" ? <Video className="size-3.5 shrink-0" aria-hidden="true" /> : <MapPin className="size-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">
            {eventPlace(event)} · {FORMAT_LABELS[event.format]}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          {event.goingCount} going
          {event.capacity !== null ? ` · ${full ? "Full — waitlist open" : `${event.capacity - event.goingCount} places left`}` : ""}
          <span aria-hidden="true">·</span> Hosted by {event.host.displayName}
        </p>
      </div>
    </Link>
  );
}
