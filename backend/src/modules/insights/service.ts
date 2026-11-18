import "server-only";
import type { DbClient } from "@backend/db/server";
import { unwrap } from "@backend/http/db-errors";

/*
 * Privacy-first profile insights. Members see only aggregate counts for their own profile —
 * never who viewed it. Recording and aggregation are done by SQL functions (migration
 * 20261118000300), which ignore self-views, staff views and views of profiles the viewer
 * couldn't see.
 */

export async function recordProfileView(db: DbClient, profileId: string): Promise<void> {
  unwrap(await db.rpc("record_profile_view", { p_profile: profileId }));
}

export type ProfileInsights = {
  days: { day: string; views: number }[];
  total: number;
  last7: number;
  previous7: number;
};

export async function profileInsights(db: DbClient, days = 30): Promise<ProfileInsights> {
  const rows = (unwrap(await db.rpc("profile_view_stats", { p_days: days })) ?? []) as { day: string; views: number }[];
  const series = rows.map((r) => ({ day: r.day, views: Number(r.views) }));
  const sum = (xs: { views: number }[]) => xs.reduce((s, r) => s + r.views, 0);
  return {
    days: series,
    total: sum(series),
    last7: sum(series.slice(-7)),
    previous7: sum(series.slice(-14, -7)),
  };
}
