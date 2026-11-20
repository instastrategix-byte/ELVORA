import { listIntroductions, requestIntroduction, requestIntroductionSchema } from "@backend/modules/introductions/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "introductions.list" }, async ({ session }) => listIntroductions(session.db));

export const POST = route(
  { name: "introductions.request", feature: "connections.request", body: requestIntroductionSchema, rateLimitPerMinute: 5 },
  async ({ session, body }) => requestIntroduction(session.db, body),
);
