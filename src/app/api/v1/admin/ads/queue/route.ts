import { reviewQueue } from "@backend/modules/advertising";
import { route } from "@backend/http/route";

/** Campaigns, ads and appeals awaiting a moderator. */
export const GET = route({ name: "admin.ads.queue", staff: "moderator" }, async ({ session }) => reviewQueue(session.db));
