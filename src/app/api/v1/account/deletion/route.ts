import { z } from "zod";
import { cancelAccountDeletion, requestAccountDeletion } from "@backend/modules/membership/service";
import { route } from "@backend/http/route";

export const POST = route(
  { name: "account.deletion_request", auth: "user", body: z.object({ reason: z.string().trim().max(1000).optional(), confirm: z.literal("DELETE") }) },
  async ({ session, body }) => {
    await requestAccountDeletion(session.db, session.viewer, body.reason);
    return { status: "pending" };
  },
);

export const DELETE = route({ name: "account.deletion_cancel", auth: "user" }, async ({ session }) => {
  await cancelAccountDeletion(session.db);
  return { status: "cancelled" };
});
