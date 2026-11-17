import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AppError } from "@/lib/errors";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient, type DbClient } from "@backend/db/server";
import {
  hasFeature,
  isStaff,
  parseFeatures,
  type Feature,
  type StaffRole,
  type Viewer,
} from "@backend/modules/auth/permissions";

export type Session = { viewer: Viewer; db: DbClient };

/**
 * Resolves the current user from the verified session JWT plus trusted database state.
 * Memoized per request with React `cache`.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const { data: claimsData, error } = await db.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (error || !userId) return null;

  const [profileRes, featuresRes, staffRes, businessRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, handle, display_name, avatar_path, account_status, onboarding_completed_at, verified_kinds")
      .eq("id", userId)
      .maybeSingle(),
    db.rpc("user_features"),
    db.from("staff_roles").select("role").eq("user_id", userId).maybeSingle(),
    db.from("businesses").select("id").eq("owner_id", userId).eq("status", "approved").limit(1),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const viewer: Viewer = {
    id: profile.id,
    email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : null,
    handle: profile.handle,
    displayName: profile.display_name,
    avatarPath: profile.avatar_path,
    accountStatus: profile.account_status,
    onboarded: profile.onboarding_completed_at !== null,
    features: parseFeatures(featuresRes.data),
    staffRole: (staffRes.data?.role as StaffRole | undefined) ?? null,
    verifiedKinds: profile.verified_kinds,
    hasApprovedBusiness: (businessRes.data?.length ?? 0) > 0,
  };
  return { viewer, db };
});

export async function getViewer(): Promise<Viewer | null> {
  return (await getSession())?.viewer ?? null;
}

type PageRequirement = { onboarded?: boolean; staff?: StaffRole; next?: string };

/** For pages: redirects instead of throwing. */
export async function requirePageSession(req: PageRequirement = {}): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/sign-in${req.next ? `?next=${encodeURIComponent(req.next)}` : ""}`);
  const { viewer } = session;
  if (viewer.accountStatus !== "active") redirect("/account/restricted");
  if (req.onboarded !== false && !viewer.onboarded) redirect("/onboarding");
  if (req.staff && !isStaff(viewer, req.staff)) redirect("/home");
  return session;
}

type ApiRequirement = { onboarded?: boolean; staff?: StaffRole; feature?: Feature };

/** For route handlers: throws typed AppErrors mapped to 401/403. */
export async function requireApiSession(req: ApiRequirement = {}): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AppError("unauthenticated", "Please sign in to continue.");
  const { viewer } = session;
  if (viewer.accountStatus !== "active") throw new AppError("forbidden", "Your account is currently restricted.");
  if (req.onboarded !== false && !viewer.onboarded) throw new AppError("forbidden", "Please complete onboarding first.");
  if (req.staff && !isStaff(viewer, req.staff)) throw new AppError("forbidden", "Staff access required.");
  if (req.feature && !hasFeature(viewer, req.feature)) {
    throw new AppError("forbidden", "Your current membership does not include this feature.");
  }
  return session;
}
