import { hideVouchSchema, setVouchHidden, withdrawVouch } from "@backend/modules/vouches/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

/** Vouchee: show or hide this vouch on their profile. */
export const PATCH = route({ name: "vouches.hide", params: idParams, body: hideVouchSchema, rateLimitPerMinute: 30 }, async ({ session, params, body }) => {
  await setVouchHidden(session.db, params.id, body.hidden);
  return { ok: true };
});

/** Voucher: withdraw this vouch. */
export const DELETE = route({ name: "vouches.withdraw", params: idParams, rateLimitPerMinute: 30 }, async ({ session, params }) => {
  await withdrawVouch(session.db, params.id);
  return { ok: true };
});
