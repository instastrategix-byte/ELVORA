import { createUploadTicket, uploadRequestSchema } from "@backend/modules/storage/service";
import { route } from "@backend/http/route";

/** Issues a signed upload URL for one file after validating type, extension and size. */
export const POST = route(
  { name: "uploads.create", auth: "user", body: uploadRequestSchema, rateLimitPerMinute: 30 },
  async ({ session, body }) => createUploadTicket(session.db, session.viewer, body),
);
