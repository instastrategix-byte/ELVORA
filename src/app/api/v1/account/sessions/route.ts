import { AppError } from "@/lib/errors";
import { route } from "@backend/http/route";

/** Signs out every other session (refresh tokens revoked by Supabase Auth). */
export const DELETE = route({ name: "account.sign_out_others", auth: "user" }, async ({ session }) => {
  const { error } = await session.db.auth.signOut({ scope: "others" });
  if (error) throw new AppError("service_unavailable", "Could not sign out other sessions. Please try again.");
  return { signedOutOthers: true };
});
