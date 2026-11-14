import { z } from "zod";
import { listNotifications, markRead, markReadSchema, unreadNotificationCount } from "@backend/modules/notifications/service";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "notifications.list", auth: "user", query: z.object({ cursor: z.string().max(200).optional(), countOnly: z.enum(["1"]).optional() }) },
  async ({ session, query }) => {
    if (query.countOnly) return { unread: await unreadNotificationCount(session.db, session.viewer) };
    return listNotifications(session.db, session.viewer, query.cursor);
  },
);

export const PATCH = route({ name: "notifications.read", auth: "user", body: markReadSchema }, async ({ session, body }) => {
  await markRead(session.db, session.viewer, body);
  return { read: true };
});
