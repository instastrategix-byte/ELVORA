import "server-only";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { throwIfError, unwrap } from "@backend/http/db-errors";

export type ConnectionView = {
  id: string;
  status: "pending" | "accepted" | "declined";
  direction: "incoming" | "outgoing";
  other: ProfileSummary;
  message: string | null;
  createdAt: string;
};

export type ConnectionTab = "connections" | "received" | "sent";

const LIMIT = 100;

export async function listConnections(db: DbClient, viewer: Viewer, tab: ConnectionTab): Promise<ConnectionView[]> {
  let query = db
    .from("connections")
    .select("id, requester_id, addressee_id, status, message, created_at, responded_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (tab === "connections") query = query.eq("status", "accepted");
  if (tab === "received") query = query.eq("status", "pending").eq("addressee_id", viewer.id);
  if (tab === "sent") query = query.eq("status", "pending").eq("requester_id", viewer.id);
  const rows = unwrap(await query);
  const otherIds = rows.map((r) => (r.requester_id === viewer.id ? r.addressee_id : r.requester_id));
  const profiles = await getSummaries(db, otherIds);
  return rows.map((r) => {
    const otherId = r.requester_id === viewer.id ? r.addressee_id : r.requester_id;
    return {
      id: r.id,
      status: r.status,
      direction: r.requester_id === viewer.id ? "outgoing" : "incoming",
      other: profiles.get(otherId)!,
      message: r.message,
      createdAt: r.created_at,
    };
  });
}

export async function countPendingRequests(db: DbClient, viewer: Viewer): Promise<number> {
  const { count } = await db
    .from("connections")
    .select("id", { count: "exact", head: true })
    .eq("addressee_id", viewer.id)
    .eq("status", "pending");
  return count ?? 0;
}

export async function requestConnection(db: DbClient, viewer: Viewer, addresseeId: string, message?: string): Promise<{ id: string }> {
  if (addresseeId === viewer.id) throw new AppError("business_rule", "You cannot connect with yourself.");
  const id = unwrap(await db.rpc("request_connection", { p_addressee: addresseeId, p_message: message ?? undefined }));
  return { id };
}

export async function respondToConnection(db: DbClient, connectionId: string, accept: boolean) {
  unwrap(await db.rpc("respond_to_connection", { p_id: connectionId, p_accept: accept }));
}

export async function removeConnection(db: DbClient, connectionId: string) {
  unwrap(await db.rpc("remove_connection", { p_id: connectionId }));
}

export async function setFollow(db: DbClient, viewer: Viewer, userId: string, follow: boolean) {
  if (userId === viewer.id) throw new AppError("business_rule", "You cannot follow yourself.");
  if (follow) {
    const { error } = await db.from("follows").insert({ follower_id: viewer.id, followee_id: userId });
    if (error && error.code !== "23505") throwIfError(error);
  } else {
    unwrap(await db.from("follows").delete().eq("follower_id", viewer.id).eq("followee_id", userId));
  }
}

export async function setBlock(db: DbClient, viewer: Viewer, userId: string, block: boolean) {
  if (userId === viewer.id) throw new AppError("business_rule", "You cannot block yourself.");
  if (block) {
    const { error } = await db.from("user_blocks").insert({ blocker_id: viewer.id, blocked_id: userId });
    if (error && error.code !== "23505") throwIfError(error);
  } else {
    unwrap(await db.from("user_blocks").delete().eq("blocker_id", viewer.id).eq("blocked_id", userId));
  }
}
