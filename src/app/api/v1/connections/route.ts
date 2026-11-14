import { z } from "zod";
import { listConnections, requestConnection } from "@backend/modules/connections/service";
import { route } from "@backend/http/route";

export const GET = route(
  { name: "connections.list", query: z.object({ tab: z.enum(["connections", "received", "sent"]).default("connections") }) },
  async ({ session, query }) => listConnections(session.db, session.viewer, query.tab),
);

export const POST = route(
  {
    name: "connections.request",
    feature: "connections.request",
    body: z.object({ userId: z.uuid(), message: z.string().trim().max(300).optional() }),
    rateLimitPerMinute: 20,
  },
  async ({ session, body }) => requestConnection(session.db, session.viewer, body.userId, body.message),
);
