import "server-only";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";
import { ROLE_RANK, type AdRole } from "./constants";

/*
 * Ads Manager authorisation. These checks give friendly errors early; the database enforces the
 * same rules independently through RLS and SECURITY DEFINER functions (migration 20261122000100),
 * so a missed check here can never grant access.
 */

export async function adRole(db: DbClient, accountId: string): Promise<AdRole | null> {
  const role = unwrap(await db.rpc("ad_account_role", { p_account: accountId }));
  return (role as AdRole | null) ?? null;
}

/** Throws not_found (no existence leak) when the caller isn't on the account, forbidden when their role is too low. */
export async function requireAdRole(db: DbClient, accountId: string, min: AdRole): Promise<AdRole> {
  const role = await adRole(db, accountId);
  if (!role) throw new AppError("not_found", "Advertising account not found.");
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new AppError("forbidden", min === "editor" ? "Your role on this account is view-only." : "Only account owners and admins can do that.");
  }
  return role;
}

export function roleAtLeast(role: AdRole | null, min: AdRole): boolean {
  return Boolean(role && ROLE_RANK[role] >= ROLE_RANK[min]);
}
