import { uploadUrlSchema } from "@backend/modules/messaging/attachments";
import { createAttachmentUpload } from "@backend/modules/messaging/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Signed upload URL for one message attachment (validated server-side; storage RLS re-checks). */
export const POST = route(
  { name: "messages.attachment_upload", feature: "messages.send", params: idParams, body: uploadUrlSchema, rateLimitPerMinute: 60 },
  async ({ session, params, body }) => createAttachmentUpload(session.db, session.viewer, params.id, body),
);
