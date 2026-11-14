import "server-only";
import { z } from "zod";
import { decodeCursor, olderThanFilter, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { unwrap } from "@backend/http/db-errors";
import type { Json } from "@backend/db/database.types";

export type NotificationView = {
  id: string;
  type: string;
  actor: ProfileSummary | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, Json | undefined>;
  readAt: string | null;
  createdAt: string;
};

export const markReadSchema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.uuid()).min(1).max(100) })]);

export const preferencesSchema = z.object({
  connectionActivity: z.boolean(),
  postActivity: z.boolean(),
  messages: z.boolean(),
  marketplace: z.boolean(),
  emailEnabled: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof preferencesSchema>;

const PAGE = 25;

export async function listNotifications(db: DbClient, viewer: Viewer, cursor?: string): Promise<Page<NotificationView>> {
  let query = db
    .from("notifications")
    .select("id, type, actor_id, entity_type, entity_id, payload, read_at, created_at")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  const c = decodeCursor(cursor);
  if (c) query = query.or(olderThanFilter(c));
  const rows = unwrap(await query);
  const page = toPage(rows, PAGE, (r) => ({ t: r.created_at, id: r.id }));
  const actors = await getSummaries(db, page.items.map((r) => r.actor_id).filter((x): x is string => Boolean(x)));
  return {
    items: page.items.map((r) => ({
      id: r.id,
      type: r.type,
      actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null,
      entityType: r.entity_type,
      entityId: r.entity_id,
      payload: (r.payload && typeof r.payload === "object" && !Array.isArray(r.payload) ? r.payload : {}) as Record<string, Json | undefined>,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
    nextCursor: page.nextCursor,
  };
}

export async function unreadNotificationCount(db: DbClient, viewer: Viewer): Promise<number> {
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .is("read_at", null);
  return count ?? 0;
}

export async function markRead(db: DbClient, viewer: Viewer, input: z.infer<typeof markReadSchema>) {
  let query = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).is("read_at", null);
  if ("ids" in input) query = query.in("id", input.ids);
  unwrap(await query);
}

export async function getPreferences(db: DbClient, viewer: Viewer): Promise<NotificationPreferences> {
  const row = unwrap(await db.from("notification_preferences").select("*").eq("user_id", viewer.id).maybeSingle());
  return {
    connectionActivity: row?.connection_activity ?? true,
    postActivity: row?.post_activity ?? true,
    messages: row?.messages ?? true,
    marketplace: row?.marketplace ?? true,
    emailEnabled: row?.email_enabled ?? true,
  };
}

export async function updatePreferences(db: DbClient, viewer: Viewer, prefs: NotificationPreferences) {
  unwrap(
    await db.from("notification_preferences").upsert({
      user_id: viewer.id,
      connection_activity: prefs.connectionActivity,
      post_activity: prefs.postActivity,
      messages: prefs.messages,
      marketplace: prefs.marketplace,
      email_enabled: prefs.emailEnabled,
    }),
  );
}
