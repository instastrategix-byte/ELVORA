import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { getAdAccount, listMyAdAccounts } from "@backend/modules/advertising";
import type { AdAccount } from "@backend/modules/advertising/types";
import { requirePageSession, type Session } from "@backend/auth/viewer";

export type AdsPageContext = Session & { account: AdAccount; accounts: AdAccount[] };

/**
 * Every Ads Manager page calls this first: it requires a session, then loads the account through
 * RLS. Members who don't belong to the account get a 404 (not a 403) so account ids can't be probed.
 */
export const loadAdsPage = cache(async (accountId: string, section = ""): Promise<AdsPageContext> => {
  const session = await requirePageSession({ next: `/ads-manager/${accountId}${section ? `/${section}` : ""}` });
  if (!z.uuid().safeParse(accountId).success) notFound();
  const [account, accounts] = await Promise.all([getAdAccount(session.db, accountId), listMyAdAccounts(session.db, session.viewer)]);
  // Staff can read any account through RLS, but the Ads Manager is for account members only;
  // moderators use /admin/ads.
  if (!account || !account.role) notFound();
  return { ...session, account, accounts };
});

/** Re-throws Next.js control-flow errors (notFound, redirect) so they aren't shown as service errors. */
export function rethrowNavigation(error: unknown) {
  if (error && typeof error === "object" && "digest" in error) throw error;
}
