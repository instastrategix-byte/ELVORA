import "server-only";
import { AppError } from "@/lib/errors";
import { publicMediaUrl } from "@/lib/media";
import { decodeCursor, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import { isStaff, type Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { PRIVATE_MEMBER } from "@backend/modules/profiles/types";
import { assertOwnedPath } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { EventInput } from "./schemas";
import type { Attendee, EventCard, EventDetail, RsvpStatus } from "./types";

export type { Attendee, EventCard, EventDetail, RsvpStatus } from "./types";

const PAGE = 20;
const EVENT_COLUMNS =
  "id, host_id, business_id, title, summary, description, format, venue_name, city, country, starts_at, ends_at, capacity, visibility, status, cover_path, created_at";

type EventRow = {
  id: string;
  host_id: string;
  business_id: string | null;
  title: string;
  summary: string | null;
  description: string | null;
  format: EventCard["format"];
  venue_name: string | null;
  city: string | null;
  country: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  visibility: EventCard["visibility"];
  status: EventCard["status"];
  cover_path: string | null;
  created_at: string;
};

/** Mirrors `public.can_host_events()`; the database policy is the real gate. */
export function canHostEvents(viewer: Viewer | null): boolean {
  if (!viewer || viewer.accountStatus !== "active" || !viewer.onboarded) return false;
  return (
    isStaff(viewer) ||
    viewer.hasApprovedBusiness ||
    viewer.verifiedKinds.includes("executive") ||
    viewer.verifiedKinds.includes("public_figure")
  );
}

async function hydrate(db: DbClient, viewer: Viewer, rows: EventRow[]): Promise<EventCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [hosts, stats, mine] = await Promise.all([
    getSummaries(
      db,
      rows.map((r) => r.host_id),
    ),
    db.rpc("event_stats", { p_events: ids }),
    db.from("event_rsvps").select("event_id, status").eq("user_id", viewer.id).in("event_id", ids),
  ]);
  throwIfError(stats.error);
  throwIfError(mine.error);
  const statsById = new Map((stats.data ?? []).map((s) => [s.event_id, s]));
  const mineById = new Map((mine.data ?? []).map((r) => [r.event_id, r.status as RsvpStatus]));
  const now = Date.now();
  return rows.map((r) => {
    const s = statsById.get(r.id);
    return {
      id: r.id,
      title: r.title,
      summary: r.summary,
      format: r.format,
      venueName: r.venue_name,
      city: r.city,
      country: r.country,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      capacity: r.capacity,
      visibility: r.visibility,
      status: r.status,
      coverUrl: publicMediaUrl("profile-media", r.cover_path),
      host: hosts.get(r.host_id) ?? { id: r.host_id, ...PRIVATE_MEMBER },
      goingCount: s?.going_count ?? 0,
      waitlistCount: s?.waitlist_count ?? 0,
      interestedCount: s?.interested_count ?? 0,
      myRsvp: mineById.get(r.id) ?? null,
      isHost: r.host_id === viewer.id,
      ended: new Date(r.ends_at).getTime() <= now,
    };
  });
}

export type EventFilter = "upcoming" | "mine" | "hosting";

/**
 * upcoming: published events the viewer can see that have not ended, soonest first (paginated).
 * mine: events the viewer responded to or was invited to, not yet ended.
 * hosting: everything the viewer hosts, including drafts and past events.
 */
export async function listUpcomingEvents(
  db: DbClient,
  viewer: Viewer,
  opts: { filter?: EventFilter; cursor?: string } = {},
): Promise<Page<EventCard>> {
  const filter = opts.filter ?? "upcoming";
  const now = new Date().toISOString();

  if (filter === "hosting") {
    const rows = unwrap(
      await db.from("events").select(EVENT_COLUMNS).eq("host_id", viewer.id).order("starts_at", { ascending: false }).limit(100),
    ) as EventRow[];
    return { items: await hydrate(db, viewer, rows), nextCursor: null };
  }

  if (filter === "mine") {
    const rsvps = unwrap(
      await db.from("event_rsvps").select("event_id").eq("user_id", viewer.id).neq("status", "cancelled").limit(200),
    );
    const ids = rsvps.map((r) => r.event_id);
    if (ids.length === 0) return { items: [], nextCursor: null };
    const rows = unwrap(
      await db.from("events").select(EVENT_COLUMNS).in("id", ids).neq("status", "draft").gt("ends_at", now).order("starts_at").limit(100),
    ) as EventRow[];
    return { items: await hydrate(db, viewer, rows), nextCursor: null };
  }

  let q = db
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "published")
    .gt("ends_at", now)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE + 1);
  const cursor = decodeCursor(opts.cursor);
  if (cursor) q = q.or(`starts_at.gt.${cursor.t},and(starts_at.eq.${cursor.t},id.gt.${cursor.id})`);
  const rows = unwrap(await q) as EventRow[];
  const page = toPage(rows, PAGE, (r) => ({ t: r.starts_at, id: r.id }));
  return { items: await hydrate(db, viewer, page.items), nextCursor: page.nextCursor };
}

/** The next few events for the member dashboard: ones the viewer is attending first, then others. */
export async function listUpcomingForDashboard(db: DbClient, viewer: Viewer, limit = 3): Promise<EventCard[]> {
  const [mine, upcoming] = await Promise.all([
    listUpcomingEvents(db, viewer, { filter: "mine" }),
    listUpcomingEvents(db, viewer, { filter: "upcoming" }),
  ]);
  const seen = new Set<string>();
  const out: EventCard[] = [];
  for (const e of [...mine.items.filter((e) => e.status === "published"), ...upcoming.items]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/** Upcoming published events matching title, summary or city. RLS limits results to visible events. */
export async function searchEvents(db: DbClient, viewer: Viewer, q: string, limit = 10): Promise<EventCard[]> {
  const term = q.replace(/[%,()*\\"]/g, " ").trim().slice(0, 80);
  if (!term) return [];
  const like = `%${term}%`;
  const rows = unwrap(
    await db
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("status", "published")
      .gt("ends_at", new Date().toISOString())
      .or(`title.ilike.${like},summary.ilike.${like},city.ilike.${like}`)
      .order("starts_at", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50)),
  ) as EventRow[];
  return hydrate(db, viewer, rows);
}

export async function getEvent(db: DbClient, viewer: Viewer, id: string): Promise<EventDetail | null> {
  const row = unwrap(await db.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle()) as EventRow | null;
  if (!row) return null;
  // RLS returns no row unless the viewer is the host, staff or a confirmed attendee.
  const [cards, details] = await Promise.all([
    hydrate(db, viewer, [row]),
    db.from("event_private_details").select("online_url").eq("event_id", id).maybeSingle(),
  ]);
  throwIfError(details.error);
  const card = cards[0]!;
  return {
    ...card,
    description: row.description,
    coverPath: row.cover_path,
    businessId: row.business_id,
    onlineUrl: details.data?.online_url ?? null,
    canManage: card.isHost || isStaff(viewer, "moderator"),
  };
}

function toRow(viewer: Viewer, input: EventInput) {
  if (input.coverPath) assertOwnedPath(viewer, input.coverPath);
  return {
    title: input.title,
    summary: input.summary ?? null,
    description: input.description ?? null,
    format: input.format,
    venue_name: input.format === "virtual" ? null : (input.venueName ?? null),
    city: input.format === "virtual" ? null : (input.city ?? null),
    country: input.format === "virtual" ? null : (input.country ?? null),
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    capacity: input.capacity ?? null,
    visibility: input.visibility,
    cover_path: input.coverPath ?? null,
    business_id: input.businessId ?? null,
  };
}

async function saveJoiningLink(db: DbClient, eventId: string, input: EventInput) {
  const url = input.format === "in_person" ? null : (input.onlineUrl ?? null);
  const { error } = await db.from("event_private_details").upsert({ event_id: eventId, online_url: url }, { onConflict: "event_id" });
  throwIfError(error, "The joining link could not be saved.");
}

export async function createEvent(db: DbClient, viewer: Viewer, input: EventInput): Promise<{ id: string }> {
  if (!canHostEvents(viewer)) {
    throw new AppError("forbidden", "Hosting is available to verified executives, public figures and verified businesses.");
  }
  const row = unwrap(
    await db
      .from("events")
      .insert({ ...toRow(viewer, input), host_id: viewer.id, status: "draft" })
      .select("id")
      .single(),
    "The event could not be created.",
  );
  await saveJoiningLink(db, row.id, input);
  return { id: row.id };
}

export async function updateEvent(db: DbClient, viewer: Viewer, id: string, input: EventInput): Promise<{ id: string }> {
  const rows = unwrap(await db.from("events").update(toRow(viewer, input)).eq("id", id).select("id"), "The event could not be saved.");
  if (rows.length === 0) throw new AppError("not_found", "Event not found.");
  await saveJoiningLink(db, id, input);
  return { id };
}

export async function applyEventAction(db: DbClient, id: string, action: "publish" | "unpublish" | "cancel") {
  const status = action === "publish" ? "published" : action === "unpublish" ? "draft" : "cancelled";
  if (action === "unpublish") {
    const going = unwrap(await db.rpc("event_stats", { p_events: [id] }));
    if ((going[0]?.going_count ?? 0) + (going[0]?.interested_count ?? 0) > 0) {
      throw new AppError("business_rule", "Members have already responded. Cancel the event instead of unpublishing it.");
    }
  }
  const rows = unwrap(await db.from("events").update({ status }).eq("id", id).select("id, status"));
  if (rows.length === 0) throw new AppError("not_found", "Event not found.");
  return { status };
}

export async function deleteEvent(db: DbClient, id: string) {
  const rows = unwrap(await db.from("events").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("business_rule", "Only draft events can be deleted. Cancel a published event instead.");
}

export async function setRsvp(
  db: DbClient,
  viewer: Viewer,
  eventId: string,
  status: "going" | "interested" | "cancelled",
  note?: string | null,
): Promise<{ status: RsvpStatus }> {
  const existing = unwrap(
    await db.from("event_rsvps").select("status").eq("event_id", eventId).eq("user_id", viewer.id).maybeSingle(),
  );
  // A waitlisted member asking to "go" keeps their place in the queue.
  if (existing?.status === "waitlisted" && status === "going") return { status: "waitlisted" };
  const result = existing
    ? await db
        .from("event_rsvps")
        .update({ status, note: note ?? null })
        .eq("event_id", eventId)
        .eq("user_id", viewer.id)
        .select("status")
        .single()
    : await db.from("event_rsvps").insert({ event_id: eventId, user_id: viewer.id, status, note: note ?? null }).select("status").single();
  if (result.error?.code === "42501" || result.error?.code === "PGRST116") {
    throw new AppError("business_rule", "This event is not accepting responses.");
  }
  const row = unwrap(result);
  return { status: row.status as RsvpStatus };
}

/** RLS decides who appears: the host and staff see everyone; confirmed attendees see other attendees. */
export async function listAttendees(db: DbClient, eventId: string): Promise<Attendee[]> {
  const rows = unwrap(
    await db
      .from("event_rsvps")
      .select("user_id, status, updated_at")
      .eq("event_id", eventId)
      .neq("status", "cancelled")
      .order("updated_at")
      .limit(500),
  );
  const people = await getSummaries(
    db,
    rows.map((r) => r.user_id),
  );
  return rows.map((r) => ({
    profile: people.get(r.user_id) ?? { id: r.user_id, ...PRIVATE_MEMBER },
    status: r.status as RsvpStatus,
    respondedAt: r.updated_at,
  }));
}

export async function inviteToEvent(db: DbClient, eventId: string, handle: string) {
  const member = unwrap(await db.from("profiles").select("id").eq("handle", handle).maybeSingle());
  if (!member) throw new AppError("not_found", "No member with that handle.", { handle: ["No member with that handle"] });
  const { error } = await db.rpc("invite_to_event", { p_event: eventId, p_user: member.id });
  throwIfError(error);
}
