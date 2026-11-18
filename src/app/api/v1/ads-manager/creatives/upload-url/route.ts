import { createMediaUpload } from "@backend/modules/advertising";
import { mediaUploadSchema } from "@backend/modules/advertising/validators";
import { route } from "@backend/http/route";

/** Signed upload URL into the private ad-media bucket (type, size, dimensions and duration validated). */
export const POST = route({ name: "ads_manager.creatives.upload_url", body: mediaUploadSchema, rateLimitPerMinute: 30 }, async ({ session, body }) =>
  createMediaUpload(session.db, body),
);
