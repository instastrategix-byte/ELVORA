import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createMigratedDb, createUser } from "./pglite";

const HOST = "00000000-0000-4000-8000-0000000000e1"; // owns an approved business
const EXEC = "00000000-0000-4000-8000-0000000000e2"; // verified executive
const MEM1 = "00000000-0000-4000-8000-0000000000e3";
const MEM2 = "00000000-0000-4000-8000-0000000000e4";
const MEM3 = "00000000-0000-4000-8000-0000000000e5";
const PLAIN = "00000000-0000-4000-8000-0000000000e6"; // ordinary member, may not host
const FRESH = "00000000-0000-4000-8000-0000000000e7"; // not onboarded

let db: PGlite;

const FUTURE = { starts: "now() + interval '7 days'", ends: "now() + interval '7 days 3 hours'" };

async function createEvent(
  hostId: string,
  opts: { status?: string; visibility?: string; capacity?: number | null; title?: string } = {},
): Promise<string> {
  return asUser(db, hostId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      `insert into public.events (host_id, title, starts_at, ends_at, status, visibility, capacity)
       values ($1, $2, ${FUTURE.starts}, ${FUTURE.ends}, $3, $4, $5) returning id`,
      [hostId, opts.title ?? "Founders dinner", opts.status ?? "published", opts.visibility ?? "members", opts.capacity ?? null],
    );
    return r.rows[0]!.id;
  });
}

async function rsvp(userId: string, eventId: string, status: string): Promise<string> {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ status: string }>(
      `insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, $3)
       on conflict (event_id, user_id) do update set status = excluded.status returning status`,
      [eventId, userId, status],
    );
    return r.rows[0]!.status;
  });
}

async function visibleEventIds(userId: string | null): Promise<string[]> {
  return asUser(db, userId, async (tx) => (await tx.query<{ id: string }>(`select id from public.events`)).rows.map((r) => r.id));
}

beforeAll(async () => {
  db = await createMigratedDb();
  for (const [id, handle] of [
    [HOST, "hostess"],
    [EXEC, "executive"],
    [MEM1, "member_one"],
    [MEM2, "member_two"],
    [MEM3, "member_three"],
    [PLAIN, "plain"],
  ] as const) {
    await createUser(db, { id, handle });
  }
  await createUser(db, { id: FRESH, handle: "fresh", onboarded: false });
  await db.query(
    `insert into public.businesses (owner_id, name, slug, category, status) values ($1, 'Maison Host', 'maison-host', 'events', 'approved')`,
    [HOST],
  );
  await db.query(`update public.profiles set verified_kinds = '{executive}' where id = $1`, [EXEC]);
}, 60_000);

describe("event hosting", () => {
  it("ordinary members cannot create events", async () => {
    await expect(createEvent(PLAIN)).rejects.toThrow(/row-level security/);
    expect(await asUser(db, PLAIN, async (tx) => (await tx.query<{ ok: boolean }>(`select public.can_host_events() as ok`)).rows[0]!.ok)).toBe(false);
  });

  it("approved-business owners and verified executives can host", async () => {
    expect(await createEvent(HOST)).toMatch(/[0-9a-f-]{36}/);
    expect(await createEvent(EXEC, { title: "Board circle" })).toMatch(/[0-9a-f-]{36}/);
  });

  it("hosts cannot create events on someone else's behalf or change the host", async () => {
    await expect(
      asUser(db, HOST, (tx) =>
        tx.query(
          `insert into public.events (host_id, title, starts_at, ends_at) values ($1, 'Spoofed', ${FUTURE.starts}, ${FUTURE.ends})`,
          [EXEC],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const id = await createEvent(HOST, { title: "Owned" });
    await expect(asUser(db, HOST, (tx) => tx.query(`update public.events set host_id = $1 where id = $2`, [EXEC, id]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("members cannot edit another host's event", async () => {
    const id = await createEvent(HOST, { title: "Untouchable" });
    const r = await asUser(db, MEM1, (tx) => tx.query(`update public.events set title = 'Hijacked' where id = $1 returning id`, [id]));
    expect(r.rows).toHaveLength(0);
  });

  it("cancellation is final", async () => {
    const id = await createEvent(HOST, { title: "Will cancel" });
    await asUser(db, HOST, (tx) => tx.query(`update public.events set status = 'cancelled' where id = $1`, [id]));
    await expect(asUser(db, HOST, (tx) => tx.query(`update public.events set status = 'published' where id = $1`, [id]))).rejects.toThrow(
      /cannot be reopened/,
    );
  });
});

describe("event visibility", () => {
  it("drafts are hidden from members but visible to the host", async () => {
    const draft = await createEvent(HOST, { status: "draft", title: "Secret draft" });
    expect(await visibleEventIds(MEM1)).not.toContain(draft);
    expect(await visibleEventIds(HOST)).toContain(draft);
  });

  it("anonymous visitors and members who have not finished onboarding see nothing", async () => {
    await createEvent(HOST, { title: "Members only" });
    await expect(visibleEventIds(null)).rejects.toThrow(/permission denied/);
    expect(await visibleEventIds(FRESH)).toHaveLength(0);
  });

  it("invite-only events are visible only to invited members", async () => {
    const id = await createEvent(HOST, { visibility: "invite_only", title: "Private salon" });
    expect(await visibleEventIds(MEM2)).not.toContain(id);
    await expect(rsvp(MEM2, id, "going")).rejects.toThrow(/row-level security/);
    await asUser(db, HOST, (tx) => tx.query(`select public.invite_to_event($1, $2)`, [id, MEM2]));
    expect(await visibleEventIds(MEM2)).toContain(id);
    expect(await rsvp(MEM2, id, "going")).toBe("going");
    // Only the host may invite.
    await expect(asUser(db, MEM2, (tx) => tx.query(`select public.invite_to_event($1, $2)`, [id, MEM3]))).rejects.toThrow(/forbidden/);
  });
});

describe("RSVPs", () => {
  it("members cannot respond on behalf of someone else", async () => {
    const id = await createEvent(HOST, { title: "Open house" });
    await expect(
      asUser(db, MEM1, (tx) => tx.query(`insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`, [id, MEM2])),
    ).rejects.toThrow(/row-level security/);
    await rsvp(MEM2, id, "interested");
    const r = await asUser(db, MEM1, (tx) =>
      tx.query(`update public.event_rsvps set status = 'cancelled' where event_id = $1 and user_id = $2 returning user_id`, [id, MEM2]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("capacity overflow is waitlisted and the waitlist is promoted when a seat frees up", async () => {
    const id = await createEvent(HOST, { capacity: 1, title: "Intimate dinner" });
    expect(await rsvp(MEM1, id, "going")).toBe("going");
    expect(await rsvp(MEM2, id, "going")).toBe("waitlisted");
    await rsvp(MEM1, id, "cancelled");
    const after = await db.query<{ status: string }>(`select status from public.event_rsvps where event_id = $1 and user_id = $2`, [id, MEM2]);
    expect(after.rows[0]!.status).toBe("going");
    const notified = await db.query(`select 1 from public.notifications where user_id = $1 and type = 'event_update' and payload->>'status' = 'promoted'`, [MEM2]);
    expect(notified.rows).toHaveLength(1);
  });

  it("the host is notified of new attendees", async () => {
    const id = await createEvent(HOST, { title: "Notify me" });
    await rsvp(MEM3, id, "going");
    const r = await db.query(`select 1 from public.notifications where user_id = $1 and entity_id = $2 and actor_id = $3`, [HOST, id, MEM3]);
    expect(r.rows).toHaveLength(1);
  });

  it("guest lists are visible to the host and confirmed attendees only", async () => {
    const id = await createEvent(HOST, { title: "Guest list" });
    await rsvp(MEM1, id, "going");
    await rsvp(MEM2, id, "interested");
    const seenBy = async (u: string) =>
      asUser(db, u, async (tx) => (await tx.query<{ user_id: string }>(`select user_id from public.event_rsvps where event_id = $1`, [id])).rows.map((r) => r.user_id));
    expect((await seenBy(HOST)).sort()).toEqual([MEM1, MEM2].sort());
    expect(await seenBy(MEM1)).toEqual([MEM1]);
    expect(await seenBy(MEM2)).toEqual([MEM2]);
    expect(await seenBy(MEM3)).toEqual([]);
    const stats = await asUser(db, MEM3, (tx) =>
      tx.query<{ going_count: number; interested_count: number }>(`select * from public.event_stats($1)`, [[id]]),
    );
    expect(stats.rows[0]).toMatchObject({ going_count: 1, interested_count: 1 });
  });
});

describe("joining links", () => {
  it("are readable only by the host and confirmed attendees", async () => {
    const id = await createEvent(HOST, { title: "Virtual briefing" });
    await asUser(db, HOST, (tx) =>
      tx.query(`insert into public.event_private_details (event_id, online_url) values ($1, 'https://meet.example.test/x')`, [id]),
    );
    const read = async (u: string) =>
      asUser(db, u, async (tx) => (await tx.query(`select online_url from public.event_private_details where event_id = $1`, [id])).rows);
    expect(await read(MEM1)).toHaveLength(0);
    await rsvp(MEM1, id, "interested");
    expect(await read(MEM1)).toHaveLength(0);
    await rsvp(MEM1, id, "going");
    expect(await read(MEM1)).toHaveLength(1);
    expect(await read(HOST)).toHaveLength(1);
    await expect(
      asUser(db, MEM1, (tx) => tx.query(`update public.event_private_details set online_url = 'https://evil.test' where event_id = $1 returning 1`, [id])),
    ).resolves.toMatchObject({ rows: [] });
  });
});
