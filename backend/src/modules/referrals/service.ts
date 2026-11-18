import "server-only";
import { z } from "zod";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";

/*
 * Member referrals. Eligibility, quotas (5 open, 20 per 30 days), 14-day expiry, single use and
 * hashing of codes are enforced in SQL (migration 20261119000300). Redemption uses the existing
 * invitation → membership application path, so referred people are still reviewed.
 */

export const REFERRAL_OPEN_LIMIT = 5;

export const createReferralSchema = z.object({
  email: z
    .union([z.literal(""), z.email({ error: "Enter a valid email address" })])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  note: z.string().trim().max(200).optional(),
});

export type ReferralStatus = "pending" | "joined" | "expired" | "revoked";

export type ReferralView = {
  id: string;
  email: string | null;
  note: string | null;
  status: ReferralStatus;
  createdAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  /** Present once the invitation has been used and the new member's profile is visible to you. */
  joined: ProfileSummary | null;
};

export type ReferralOverview = {
  eligible: boolean;
  invitations: ReferralView[];
  stats: { sent: number; joined: number; open: number; openRemaining: number };
};

export async function referralOverview(db: DbClient, viewer: Viewer): Promise<ReferralOverview> {
  const [eligibleRes, rowsRes] = await Promise.all([
    db.rpc("can_refer_members", { p_user: viewer.id }),
    db.rpc("list_member_invitations"),
  ]);
  const rows = unwrap(rowsRes) ?? [];
  const people = await getSummaries(db, rows.map((r) => r.redeemed_by).filter((x): x is string => Boolean(x)));
  const invitations: ReferralView[] = rows.map((r) => {
    const joined = r.redeemed_by ? (people.get(r.redeemed_by) ?? null) : null;
    return {
      id: r.id,
      email: r.email,
      note: r.note,
      status: r.status as ReferralStatus,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      redeemedAt: r.redeemed_at,
      // A profile the viewer can't see comes back as "Private member" without a handle.
      joined: joined && joined.handle ? joined : null,
    };
  });
  const open = invitations.filter((i) => i.status === "pending").length;
  return {
    eligible: Boolean(unwrap(eligibleRes)),
    invitations,
    stats: {
      sent: invitations.length,
      joined: invitations.filter((i) => i.status === "joined").length,
      open,
      openRemaining: Math.max(0, REFERRAL_OPEN_LIMIT - open),
    },
  };
}

/** Creates an invitation. The plain code is only ever returned here, once. */
export async function createReferral(db: DbClient, input: z.infer<typeof createReferralSchema>): Promise<{ id: string; code: string; expiresAt: string }> {
  const rows = unwrap(await db.rpc("create_member_invitation", { p_email: input.email ?? null, p_note: input.note ?? null }));
  const row = rows?.[0];
  if (!row) throw new Error("Invitation was not created");
  return { id: row.id, code: row.code, expiresAt: row.expires_at };
}

export async function revokeReferral(db: DbClient, id: string): Promise<void> {
  unwrap(await db.rpc("revoke_member_invitation", { p_id: id }));
}
