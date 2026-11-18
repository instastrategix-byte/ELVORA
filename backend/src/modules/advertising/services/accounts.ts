import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/format";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { AdRole } from "../constants";
import { requireAdRole } from "../permissions";
import type { AdAccount, AdAccountMember } from "../types";
import type { accountSettingsSchema, memberAddSchema } from "../validators";

const ACCOUNT_COLUMNS =
  "id, display_name, billing_email, currency, balance_minor, spend_limit_minor, billing_status, billing_mode, status, timezone";

type AccountRow = {
  id: string;
  display_name: string;
  billing_email: string | null;
  currency: string;
  balance_minor: number;
  spend_limit_minor: number | null;
  billing_status: AdAccount["billingStatus"];
  billing_mode: string;
  status: AdAccount["status"];
  timezone: string;
};

function toAccount(r: AccountRow, role: AdRole | null): AdAccount {
  return {
    id: r.id,
    displayName: r.display_name,
    billingEmail: r.billing_email,
    currency: r.currency,
    balanceMinor: Number(r.balance_minor),
    spendLimitMinor: r.spend_limit_minor === null ? null : Number(r.spend_limit_minor),
    billingStatus: r.billing_status,
    billingMode: r.billing_mode === "subscription" ? "subscription" : "prepaid",
    status: r.status,
    timezone: r.timezone,
    role,
  };
}

/** Accounts the viewer belongs to, with their role on each. */
export async function listMyAdAccounts(db: DbClient, viewer: Viewer): Promise<AdAccount[]> {
  const memberships = unwrap(await db.from("advertiser_members").select("account_id, role").eq("user_id", viewer.id));
  if (memberships.length === 0) return [];
  const rows = unwrap(
    await db
      .from("advertiser_accounts")
      .select(ACCOUNT_COLUMNS)
      .in(
        "id",
        memberships.map((m) => m.account_id),
      )
      .order("created_at"),
  );
  const roles = new Map(memberships.map((m) => [m.account_id, m.role as AdRole]));
  return rows.map((r) => toAccount(r as AccountRow, roles.get(r.id) ?? null));
}

export async function getAdAccount(db: DbClient, accountId: string): Promise<AdAccount | null> {
  const [row, role] = await Promise.all([
    db.from("advertiser_accounts").select(ACCOUNT_COLUMNS).eq("id", accountId).maybeSingle(),
    db.rpc("ad_account_role", { p_account: accountId }),
  ]);
  const r = unwrap(row);
  return r ? toAccount(r as AccountRow, (role.data as AdRole | null) ?? null) : null;
}

export async function updateAdAccount(db: DbClient, accountId: string, input: z.infer<typeof accountSettingsSchema>): Promise<AdAccount> {
  await requireAdRole(db, accountId, "admin");
  const account = await getAdAccount(db, accountId);
  if (!account) throw new AppError("not_found", "Advertising account not found.");
  const patch: { display_name?: string; billing_email?: string | null; timezone?: string; spend_limit_minor?: number | null } = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.billingEmail !== undefined) patch.billing_email = input.billingEmail;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.spendLimit !== undefined) patch.spend_limit_minor = input.spendLimit === null ? null : toMinorUnits(input.spendLimit, account.currency);
  if (Object.keys(patch).length) unwrap(await db.from("advertiser_accounts").update(patch).eq("id", accountId).select("id").single());
  return (await getAdAccount(db, accountId))!;
}

export async function listAdAccountMembers(db: DbClient, accountId: string): Promise<AdAccountMember[]> {
  await requireAdRole(db, accountId, "analyst");
  const rows = unwrap(
    await db.from("advertiser_members").select("user_id, role, created_at").eq("account_id", accountId).order("created_at"),
  );
  const people = await getSummaries(
    db,
    rows.map((r) => r.user_id),
  );
  return rows.map((r) => {
    const p = people.get(r.user_id)!;
    return { userId: r.user_id, role: r.role as AdRole, handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl, createdAt: r.created_at };
  });
}

export async function addAdAccountMember(db: DbClient, accountId: string, input: z.infer<typeof memberAddSchema>) {
  await requireAdRole(db, accountId, "admin");
  const person = unwrap(await db.from("profiles").select("id").eq("handle", input.handle).maybeSingle());
  if (!person) throw new AppError("not_found", "No member with that handle.", { handle: ["No member with that handle"] });
  unwrap(await db.rpc("add_ad_account_member", { p_account: accountId, p_user: person.id, p_role: input.role }));
}

export async function setAdAccountMemberRole(db: DbClient, accountId: string, userId: string, role: Exclude<AdRole, "owner">) {
  unwrap(await db.rpc("set_ad_account_member_role", { p_account: accountId, p_user: userId, p_role: role }));
}

export async function removeAdAccountMember(db: DbClient, accountId: string, userId: string) {
  unwrap(await db.rpc("remove_ad_account_member", { p_account: accountId, p_user: userId }));
}
