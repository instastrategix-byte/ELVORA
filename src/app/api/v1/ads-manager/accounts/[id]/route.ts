import { AppError } from "@/lib/errors";
import { getAdAccount, updateAdAccount } from "@backend/modules/advertising";
import { accountSettingsSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.accounts.get", params: idParams }, async ({ session, params }) => {
  const account = await getAdAccount(session.db, params.id);
  if (!account) throw new AppError("not_found", "Advertising account not found.");
  return account;
});

export const PATCH = route(
  { name: "ads_manager.accounts.update", params: idParams, body: accountSettingsSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => updateAdAccount(session.db, params.id, body),
);
