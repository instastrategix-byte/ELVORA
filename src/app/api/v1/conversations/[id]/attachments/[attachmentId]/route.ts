import { z } from "zod";
import { AppError } from "@/lib/errors";
import { attachmentSignedUrl } from "@backend/modules/messaging/service";
import { route } from "@backend/http/route";

/**
 * Opens or downloads an attachment via a 5-minute signed URL. Only conversation participants can
 * resolve one (RLS on message_attachments and storage.objects); the URL itself is never stored.
 */
export const GET = route(
  {
    name: "messages.attachment_get",
    params: z.object({ id: z.uuid(), attachmentId: z.uuid() }),
    query: z.object({ download: z.enum(["1", "0"]).optional() }),
    rateLimitPerMinute: 120,
  },
  async ({ session, params, query }) => {
    const url = await attachmentSignedUrl(session.db, params.id, params.attachmentId, query.download === "1");
    if (!url) throw new AppError("not_found", "Attachment not found.");
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  },
);
