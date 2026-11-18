import { listDiagnostics } from "@backend/modules/advertising/tracking/service";
import { idParams } from "@backend/http/params";
import { route } from "@backend/http/route";

export const GET = route({ name: "ads.tracking.diagnostics", params: idParams }, async ({ session, params }) => listDiagnostics(session.db, params.id));
