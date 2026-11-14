import { withdrawApplication } from "@backend/modules/membership/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const POST = route({ name: "applications.withdraw", params: idParams }, async ({ session, params }) => {
  await withdrawApplication(session.db, params.id);
  return { status: "withdrawn" };
});
