import { refinePost, refineSchema } from "@backend/modules/ai/service";
import { route } from "@backend/http/route";

/** AI writing assistance for the post composer. Members review the suggestion before posting. */
export const POST = route(
  { name: "ai.refine", feature: "feed.post", body: refineSchema, rateLimitPerMinute: 6, maxBodyBytes: 16_384 },
  async ({ body }) => refinePost(body),
);
