import "server-only";
import { publicMediaUrl } from "@/lib/media";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { rankSuggestions, type CandidateRow } from "./ranking";

export type Suggestion = { member: ProfileSummary; reason: string };

const CANDIDATE_POOL = 80;

/**
 * "People you may know": discoverable, active, onboarded members the viewer has no open
 * connection with, ranked by shared industry, city, company and interests, then verification.
 * All reads go through RLS, so profiles the viewer may not see never become candidates.
 */
export async function suggestMembers(db: DbClient, viewer: Viewer, limit = 6): Promise<Suggestion[]> {
  const [meRes, connRes, blockRes, candRes] = await Promise.all([
    db.from("profiles").select("industry, location, company, interests").eq("id", viewer.id).maybeSingle(),
    db
      .from("connections")
      .select("requester_id, addressee_id")
      .in("status", ["pending", "accepted"])
      .or(`requester_id.eq.${viewer.id},addressee_id.eq.${viewer.id}`)
      .limit(2000),
    db.from("user_blocks").select("blocked_id").eq("blocker_id", viewer.id).limit(2000),
    db
      .from("profiles")
      .select("id, handle, display_name, headline, location, avatar_path, verified_kinds, industry, company, interests")
      .eq("discoverable", true)
      .eq("account_status", "active")
      .not("onboarding_completed_at", "is", null)
      .neq("id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_POOL),
  ]);

  const exclude = new Set<string>([viewer.id]);
  for (const c of unwrap(connRes)) exclude.add(c.requester_id === viewer.id ? c.addressee_id : c.requester_id);
  for (const b of unwrap(blockRes)) exclude.add(b.blocked_id);

  const me = unwrap(meRes);
  const ranked = rankSuggestions(
    { industry: me?.industry ?? null, location: me?.location ?? null, company: me?.company ?? null, interests: me?.interests ?? [] },
    (unwrap(candRes) as CandidateRow[]).filter((c) => !exclude.has(c.id)),
    limit,
  );
  return ranked.map(({ row, reason }) => ({
    member: {
      id: row.id,
      handle: row.handle,
      displayName: row.display_name,
      headline: row.headline,
      location: row.location,
      avatarUrl: publicMediaUrl("profile-media", row.avatar_path),
      verifiedKinds: row.verified_kinds,
    },
    reason,
  }));
}

export type NetworkStats = {
  connections: number;
  newConnections30d: number;
  pendingReceived: number;
  followers: number;
  following: number;
};

/** Counts only (head requests) — no member data leaves the database. */
export async function networkStats(db: DbClient, viewer: Viewer): Promise<NetworkStats> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const mine = `requester_id.eq.${viewer.id},addressee_id.eq.${viewer.id}`;
  const [connections, newConnections30d, pendingReceived, followers, following] = await Promise.all([
    count(db.from("connections").select("id", { count: "exact", head: true }).eq("status", "accepted").or(mine)),
    count(db.from("connections").select("id", { count: "exact", head: true }).eq("status", "accepted").or(mine).gte("responded_at", since)),
    count(db.from("connections").select("id", { count: "exact", head: true }).eq("status", "pending").eq("addressee_id", viewer.id)),
    count(db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", viewer.id)),
    count(db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", viewer.id)),
  ]);
  return { connections, newConnections30d, pendingReceived, followers, following };
}
