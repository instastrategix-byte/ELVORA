import type { ProfileSummary } from "@backend/modules/profiles/types";

export type EventFormat = "in_person" | "virtual" | "hybrid";
export type EventVisibility = "members" | "invite_only";
export type EventStatus = "draft" | "published" | "cancelled";
export type RsvpStatus = "invited" | "interested" | "going" | "waitlisted" | "cancelled";

export type EventCard = {
  id: string;
  title: string;
  summary: string | null;
  format: EventFormat;
  venueName: string | null;
  city: string | null;
  country: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  visibility: EventVisibility;
  status: EventStatus;
  coverUrl: string | null;
  host: ProfileSummary;
  goingCount: number;
  waitlistCount: number;
  interestedCount: number;
  /** The viewer's own response, if any. */
  myRsvp: RsvpStatus | null;
  isHost: boolean;
  /** True once ends_at has passed (computed on the server at load time). */
  ended: boolean;
};

export type EventDetail = EventCard & {
  description: string | null;
  coverPath: string | null;
  businessId: string | null;
  /** Only present for the host, staff and confirmed attendees (enforced by RLS). */
  onlineUrl: string | null;
  canManage: boolean;
};

export type Attendee = { profile: ProfileSummary; status: RsvpStatus; respondedAt: string };
