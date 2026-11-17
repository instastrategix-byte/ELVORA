import { ArrowLeft, CalendarDays, Lock, MapPin, Users, Video } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HostControls, InviteForm, RsvpControl } from "@/components/events/event-actions";
import { RSVP_LABELS, eventPlace, formatEventRange } from "@/components/events/event-card";
import { ServiceNotice } from "@/components/feedback/service-notice";
import { Alert, Avatar, Badge, Card } from "@/components/ui/primitives";
import { VerifiedBadges } from "@/components/ui/verified-badge";
import { attempt } from "@/lib/attempt";
import { FORMAT_LABELS } from "@backend/modules/events/schemas";
import { getEvent, listAttendees } from "@backend/modules/events/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { requirePageSession } from "@backend/auth/viewer";

export const metadata: Metadata = { title: "Event", robots: { index: false } };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, db } = await requirePageSession({ next: `/events/${id}` });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const result = await attempt(async () => {
    const event = await getEvent(db, viewer, id);
    if (!event) return null;
    return { event, attendees: await listAttendees(db, id) };
  });
  if (!result.ok) return <ServiceNotice error={result.error} what="this event" />;
  if (!result.data) notFound();
  const { event, attendees } = result.data;

  const going = attendees.filter((a) => a.status === "going");
  const canRespond = event.status === "published" && !event.ended && !event.isHost;
  const full = event.capacity !== null && event.goingCount >= event.capacity;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" /> All events
      </Link>

      <Card className="overflow-hidden">
        {event.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user media from a public bucket
          <img src={event.coverUrl} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div aria-hidden="true" className="glow-gold aspect-[4/1] w-full border-b border-border" />
        )}
        <div className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{FORMAT_LABELS[event.format]}</span>
            {event.visibility === "invite_only" ? (
              <Badge>
                <Lock className="size-3" aria-hidden="true" /> Invite only
              </Badge>
            ) : null}
            {event.status === "draft" ? <Badge tone="warning">Draft — only you can see this</Badge> : null}
            {event.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : null}
            {event.ended && event.status !== "cancelled" ? <Badge>Ended</Badge> : null}
          </div>
          <h1 className="display text-4xl sm:text-5xl">{event.title}</h1>
          {event.summary ? <p className="text-lg text-muted">{event.summary}</p> : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt>
                <CalendarDays className="mt-0.5 size-4 text-accent" aria-label="When" />
              </dt>
              <dd>
                <time dateTime={event.startsAt}>{formatEventRange(event.startsAt, event.endsAt)}</time>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>
                {event.format === "virtual" ? (
                  <Video className="mt-0.5 size-4 text-accent" aria-label="Where" />
                ) : (
                  <MapPin className="mt-0.5 size-4 text-accent" aria-label="Where" />
                )}
              </dt>
              <dd>{eventPlace(event)}</dd>
            </div>
            <div className="flex gap-2">
              <dt>
                <Users className="mt-0.5 size-4 text-accent" aria-label="Guests" />
              </dt>
              <dd>
                {event.goingCount} going
                {event.capacity !== null ? ` of ${event.capacity}` : ""}
                {event.waitlistCount > 0 ? ` · ${event.waitlistCount} waitlisted` : ""}
                {event.interestedCount > 0 ? ` · ${event.interestedCount} interested` : ""}
              </dd>
            </div>
          </dl>

          {event.onlineUrl ? (
            <Alert tone="success" title="Joining link">
              <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline underline-offset-4">
                {event.onlineUrl}
              </a>
              <span className="mt-1 block text-xs">Private to you{event.isHost ? " and confirmed guests" : ""}. Please don&apos;t share it.</span>
            </Alert>
          ) : event.format !== "in_person" && !event.isHost ? (
            <p className="text-sm text-muted">The joining link is shared with confirmed guests.</p>
          ) : null}

          {canRespond ? (
            <div className="border-t border-border pt-5">
              {full && event.myRsvp !== "going" ? <p className="mb-3 text-sm text-muted">This event is full. Choosing Attend adds you to the waitlist.</p> : null}
              <RsvpControl eventId={event.id} current={event.myRsvp} />
            </div>
          ) : event.myRsvp && event.myRsvp !== "cancelled" ? (
            <p className="border-t border-border pt-5 text-sm text-muted">Your response: {RSVP_LABELS[event.myRsvp]}</p>
          ) : null}

          {event.canManage ? (
            <div className="border-t border-border pt-5">
              <p className="eyebrow mb-3">Host tools</p>
              <HostControls eventId={event.id} status={event.status} ended={event.ended} />
            </div>
          ) : null}
        </div>
      </Card>

      {event.description ? (
        <Card className="p-6 sm:p-8">
          <h2 className="display mb-3 text-2xl">About this event</h2>
          <p className="whitespace-pre-line text-[15px] leading-7 text-fg/90">{event.description}</p>
        </Card>
      ) : null}

      <Card className="p-6 sm:p-8">
        <h2 className="display mb-4 text-2xl">Host</h2>
        <HostRow profile={event.host} />
      </Card>

      {event.isHost ? (
        <Card className="space-y-5 p-6 sm:p-8">
          <h2 className="display text-2xl">Guest list</h2>
          {event.status !== "cancelled" && !event.ended ? <InviteForm eventId={event.id} /> : null}
          {attendees.length === 0 ? (
            <p className="text-sm text-muted">No responses yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {attendees.map((a) => (
                <li key={a.profile.id} className="flex items-center justify-between gap-3 py-3">
                  <HostRow profile={a.profile} />
                  <Badge tone={a.status === "going" ? "success" : a.status === "waitlisted" ? "warning" : "neutral"}>{RSVP_LABELS[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : going.length > 1 && event.myRsvp === "going" ? (
        <Card className="p-6 sm:p-8">
          <h2 className="display mb-4 text-2xl">Who&apos;s going</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {going
              .filter((a) => a.profile.id !== viewer.id)
              .map((a) => (
                <li key={a.profile.id}>
                  <HostRow profile={a.profile} />
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
    </article>
  );
}

function HostRow({ profile }: { profile: ProfileSummary }) {
  const body = (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar src={profile.avatarUrl} name={profile.displayName} size={40} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="truncate">{profile.displayName}</span>
          <VerifiedBadges kinds={profile.verifiedKinds} compact />
        </span>
        {profile.headline ? <span className="block truncate text-xs text-muted">{profile.headline}</span> : null}
      </span>
    </span>
  );
  return profile.handle ? (
    <Link href={`/members/${profile.handle}`} className="min-w-0 hover:text-accent">
      {body}
    </Link>
  ) : (
    body
  );
}
