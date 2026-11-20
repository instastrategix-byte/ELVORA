import { AppError } from "@/lib/errors";
import { deleteReel, getReel } from "@backend/modules/reels/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "reels.get", params: idParams, rateLimitPerMinute: 120 }, async ({ session, params }) => {
  const reel = await getReel(session.db, session.viewer, params.id);
  if (!reel) throw new AppError("not_found", "This reel isn't available.");
  return reel;
});

export const DELETE = route({ name: "reels.delete", params: idParams, rateLimitPerMinute: 20 }, async ({ session, params }) => {
  await deleteReel(session.db, session.viewer, params.id);
  return { deleted: true };
});
