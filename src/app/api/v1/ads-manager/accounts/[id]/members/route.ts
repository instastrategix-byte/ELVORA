import { addAdAccountMember, listAdAccountMembers } from "@backend/modules/advertising";
import { memberAddSchema } from "@backend/modules/advertising/validators";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads_manager.members.list", params: idParams }, async ({ session, params }) =>
  listAdAccountMembers(session.db, params.id),
);

export const POST = route(
  { name: "ads_manager.members.add", params: idParams, body: memberAddSchema, rateLimitPerMinute: 20 },
  async ({ session, params, body }) => {
    await addAdAccountMember(session.db, params.id, body);
    return listAdAccountMembers(session.db, params.id);
  },
);
