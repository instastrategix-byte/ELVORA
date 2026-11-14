import { advertiserAccountSchema } from "@backend/modules/ads/schemas";
import { getAdvertiserAccount, saveAdvertiserAccount } from "@backend/modules/ads/service";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads.account_get" }, async ({ session }) => getAdvertiserAccount(session.db, session.viewer));

export const PUT = route(
  { name: "ads.account_save", feature: "ads.manage", body: advertiserAccountSchema },
  async ({ session, body }) => saveAdvertiserAccount(session.db, session.viewer, body),
);
