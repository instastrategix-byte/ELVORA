import { listMyAdAccounts } from "@backend/modules/advertising";
import { route } from "@backend/http/route";

/** Advertising accounts the signed-in member belongs to, with their role. */
export const GET = route({ name: "ads_manager.accounts.list" }, async ({ session }) => listMyAdAccounts(session.db, session.viewer));
