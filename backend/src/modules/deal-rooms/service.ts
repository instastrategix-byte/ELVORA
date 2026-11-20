import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { ProfileSummary } from "@backend/modules/profiles/types";
import { checkDealRoomFile, DEAL_ROOM_BUCKET, DEAL_ROOM_FILE_TYPES, type DealRoomRole, type DealRoomStatus } from "./constants";

/*
 * Deal rooms. Every access rule (who sees what, NDA gate, roles, closed rooms, connection-only
 * invites, logged file access) is enforced in SQL — see migration 20261125000100. This module
 * shapes data for the UI and issues storage URLs with the member's own RLS-bound client.
 */

const roomFields = {
  name: z.string().trim().min(3, { error: "Give the room a name (3+ characters)" }).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  ndaRequired: z.boolean().default(false),
  ndaText: z.string().trim().max(20000).optional().nullable(),
};
function checkNda(r: { ndaRequired: boolean; ndaText?: string | null }, ctx: z.RefinementCtx) {
  if (r.ndaRequired && (!r.ndaText || r.ndaText.length < 20)) {
    ctx.addIssue({ code: "custom", path: ["ndaText"], message: "Add the NDA terms members must accept (20+ characters)" });
  }
}
export const dealRoomSchema = z.object(roomFields).superRefine(checkNda);
export const dealRoomStatusSchema = z.object({ status: z.enum(["open", "closed", "archived"]) });
export const dealRoomInviteSchema = z.object({ userId: z.uuid(), role: z.enum(["admin", "member", "viewer"]) });
export const dealRoomRoleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });
export const dealRoomJoinSchema = z.object({ ndaVersion: z.number().int().positive().nullable() });
export const dealRoomUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(120),
  size: z.number().int().positive(),
});
export const dealRoomDocumentSchema = dealRoomUploadSchema.extend({ path: z.string().min(1).max(400) });
export const dealRoomMessageSchema = z.object({ body: z.string().trim().min(1, { error: "Write a message" }).max(4000) });

export type DealRoomSummary = {
  id: string;
  name: string;
  status: DealRoomStatus;
  ndaRequired: boolean;
  role: DealRoomRole;
  updatedAt: string;
};

export type DealRoomInvitation = {
  roomId: string;
  name: string;
  role: DealRoomRole;
  invitedAt: string;
  invitedBy: ProfileSummary | null;
  ndaRequired: boolean;
  ndaText: string | null;
  ndaVersion: number;
  /** True when the member already joined and must re-accept a changed NDA. */
  rejoin: boolean;
};

export type DealRoomMember = {
  user: ProfileSummary;
  role: DealRoomRole;
  joinedAt: string | null;
  invitedAt: string;
  ndaAcceptedAt: string | null;
  ndaCurrent: boolean;
};

export type DealRoomDocument = {
  id: string;
  fileName: string;
  version: number;
  /** Older versions of the same document, newest first. */
  previous: { id: string; version: number; createdAt: string; sizeBytes: number }[];
  mimeType: string;
  sizeBytes: number;
  uploadedBy: ProfileSummary | null;
  createdAt: string;
  canRemove: boolean;
};

export type DealRoomDetail = {
  id: string;
  name: string;
  description: string | null;
  status: DealRoomStatus;
  ndaRequired: boolean;
  ndaText: string | null;
  ndaVersion: number;
  role: DealRoomRole;
  canWrite: boolean;
  canManage: boolean;
  members: DealRoomMember[];
  documents: DealRoomDocument[];
  messages: { id: string; author: ProfileSummary; body: string; createdAt: string; mine: boolean }[];
  /** Owners and admins only. */
  accessLog: { id: number; user: ProfileSummary | null; documentName: string; action: "view" | "download"; createdAt: string }[] | null;
};

export async function listDealRooms(db: DbClient, viewer: Viewer): Promise<{ rooms: DealRoomSummary[]; invitations: DealRoomInvitation[] }> {
  const [memberships, invites] = await Promise.all([
    db.from("deal_room_members").select("room_id, role").eq("user_id", viewer.id).not("joined_at", "is", null),
    db.rpc("deal_room_invitations"),
  ]);
  const roles = new Map(unwrap(memberships).map((m) => [m.room_id, m.role as DealRoomRole]));
  // Rooms the viewer can actually open (RLS: joined + current NDA).
  const rows = roles.size
    ? unwrap(
        await db
          .from("deal_rooms")
          .select("id, name, status, nda_required, updated_at")
          .in("id", [...roles.keys()])
          .order("updated_at", { ascending: false }),
      )
    : [];
  const inviteRows = unwrap(invites) ?? [];
  const people = await getSummaries(
    db,
    inviteRows.flatMap((i) => (i.invited_by ? [i.invited_by] : [])),
  );
  return {
    rooms: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      ndaRequired: r.nda_required,
      role: roles.get(r.id)!,
      updatedAt: r.updated_at,
    })),
    invitations: inviteRows.map((i) => ({
      roomId: i.room_id,
      name: i.name,
      role: i.role as DealRoomRole,
      invitedAt: i.invited_at,
      invitedBy: i.invited_by ? (people.get(i.invited_by) ?? null) : null,
      ndaRequired: i.nda_required,
      ndaText: i.nda_text,
      ndaVersion: i.nda_version,
      rejoin: i.rejoin,
    })),
  };
}

export async function getDealRoom(db: DbClient, viewer: Viewer, roomId: string): Promise<DealRoomDetail | null> {
  const room = unwrap(
    await db.from("deal_rooms").select("id, name, description, status, nda_required, nda_text, nda_version").eq("id", roomId).maybeSingle(),
  );
  if (!room) return null;
  const [roleRes, membersRes, docsRes, messagesRes] = await Promise.all([
    db.rpc("deal_room_role", { p_room: roomId }),
    db.from("deal_room_members").select("user_id, role, joined_at, invited_at, nda_accepted_at, nda_version_accepted").eq("room_id", roomId),
    db
      .from("deal_room_documents")
      .select("id, file_name, document_key, version, mime_type, size_bytes, uploaded_by, created_at")
      .eq("room_id", roomId)
      .order("version", { ascending: false }),
    db.from("deal_room_messages").select("id, author_id, body, created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(100),
  ]);
  const role = unwrap(roleRes) as DealRoomRole | null;
  if (!role) return null;
  const canManage = role === "owner" || role === "admin";
  const canWrite = room.status === "open" && role !== "viewer";

  const logRows = canManage
    ? unwrap(
        await db
          .from("deal_room_access_log")
          .select("id, document_id, user_id, action, created_at")
          .eq("room_id", roomId)
          .order("created_at", { ascending: false })
          .limit(200),
      )
    : null;

  const members = unwrap(membersRes);
  const docs = unwrap(docsRes);
  const messages = unwrap(messagesRes);
  const people = await getSummaries(db, [
    ...members.map((m) => m.user_id),
    ...docs.flatMap((d) => (d.uploaded_by ? [d.uploaded_by] : [])),
    ...messages.map((m) => m.author_id),
    ...(logRows ?? []).flatMap((l) => (l.user_id ? [l.user_id] : [])),
  ]);

  // Group versions: rows are newest version first, so the first row per key is the current one.
  const byKey = new Map<string, DealRoomDocument>();
  for (const d of docs) {
    const existing = byKey.get(d.document_key);
    if (existing) {
      existing.previous.push({ id: d.id, version: d.version, createdAt: d.created_at, sizeBytes: Number(d.size_bytes) });
      continue;
    }
    byKey.set(d.document_key, {
      id: d.id,
      fileName: d.file_name,
      version: d.version,
      previous: [],
      mimeType: d.mime_type,
      sizeBytes: Number(d.size_bytes),
      uploadedBy: d.uploaded_by ? (people.get(d.uploaded_by) ?? null) : null,
      createdAt: d.created_at,
      canRemove: canWrite && (canManage || d.uploaded_by === viewer.id),
    });
  }
  const docNames = new Map(docs.map((d) => [d.id, `${d.file_name} (v${d.version})`]));
  const order: Record<DealRoomRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

  return {
    id: room.id,
    name: room.name,
    description: room.description,
    status: room.status,
    ndaRequired: room.nda_required,
    ndaText: room.nda_text,
    ndaVersion: room.nda_version,
    role,
    canWrite,
    canManage,
    members: members
      .map((m) => ({
        user: people.get(m.user_id)!,
        role: m.role as DealRoomRole,
        joinedAt: m.joined_at,
        invitedAt: m.invited_at,
        ndaAcceptedAt: m.nda_accepted_at,
        ndaCurrent: !room.nda_required || m.role === "owner" || m.nda_version_accepted === room.nda_version,
      }))
      .sort((a, b) => order[a.role] - order[b.role] || a.user.displayName.localeCompare(b.user.displayName)),
    documents: [...byKey.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    messages: messages
      .map((m) => ({ id: m.id, author: people.get(m.author_id)!, body: m.body, createdAt: m.created_at, mine: m.author_id === viewer.id }))
      .reverse(),
    accessLog: logRows
      ? logRows.map((l) => ({
          id: l.id,
          user: l.user_id ? (people.get(l.user_id) ?? null) : null,
          // Removed documents are hidden by RLS; the log row itself stays.
          documentName: docNames.get(l.document_id) ?? "Removed document",
          action: l.action,
          createdAt: l.created_at,
        }))
      : null,
  };
}

export async function createDealRoom(db: DbClient, input: z.infer<typeof dealRoomSchema>): Promise<{ id: string }> {
  const id = unwrap(
    await db.rpc("create_deal_room", {
      p_name: input.name,
      p_description: input.description ?? null,
      p_nda_required: input.ndaRequired,
      p_nda_text: input.ndaRequired ? (input.ndaText ?? null) : null,
    }),
  );
  return { id };
}

export async function updateDealRoom(db: DbClient, roomId: string, input: z.infer<typeof dealRoomSchema>) {
  unwrap(
    await db.rpc("update_deal_room", {
      p_room: roomId,
      p_name: input.name,
      p_description: input.description ?? null,
      p_nda_required: input.ndaRequired,
      p_nda_text: input.ndaRequired ? (input.ndaText ?? null) : null,
    }),
  );
}

export async function setDealRoomStatus(db: DbClient, roomId: string, status: DealRoomStatus) {
  unwrap(await db.rpc("set_deal_room_status", { p_room: roomId, p_status: status }));
}

export async function inviteToDealRoom(db: DbClient, roomId: string, input: z.infer<typeof dealRoomInviteSchema>) {
  unwrap(await db.rpc("invite_to_deal_room", { p_room: roomId, p_user: input.userId, p_role: input.role }));
}

export async function joinDealRoom(db: DbClient, roomId: string, ndaVersion: number | null) {
  unwrap(await db.rpc("join_deal_room", { p_room: roomId, p_nda_version: ndaVersion }));
}

export async function leaveDealRoom(db: DbClient, roomId: string) {
  unwrap(await db.rpc("leave_deal_room", { p_room: roomId }));
}

export async function removeDealRoomMember(db: DbClient, roomId: string, userId: string) {
  unwrap(await db.rpc("remove_deal_room_member", { p_room: roomId, p_user: userId }));
}

export async function setDealRoomMemberRole(db: DbClient, roomId: string, userId: string, role: Exclude<DealRoomRole, "owner">) {
  unwrap(await db.rpc("set_deal_room_member_role", { p_room: roomId, p_user: userId, p_role: role }));
}

/** The viewer's connections who aren't in the room yet (invitations go only to connections). */
export async function inviteCandidates(db: DbClient, viewer: Viewer, roomId: string): Promise<ProfileSummary[]> {
  const [connections, members] = await Promise.all([
    db.from("connections").select("requester_id, addressee_id").eq("status", "accepted").limit(500),
    db.from("deal_room_members").select("user_id").eq("room_id", roomId),
  ]);
  const inRoom = new Set(unwrap(members).map((m) => m.user_id));
  const ids = unwrap(connections)
    .map((c) => (c.requester_id === viewer.id ? c.addressee_id : c.requester_id))
    .filter((id) => !inRoom.has(id));
  const people = await getSummaries(db, ids);
  return [...people.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Signed upload URL into "<room>/<viewer>/<uuid>.<ext>". Storage RLS independently requires
 * write access to an open room and the viewer's own folder.
 */
export async function createDealRoomUpload(db: DbClient, viewer: Viewer, roomId: string, input: z.infer<typeof dealRoomUploadSchema>) {
  const check = checkDealRoomFile({ type: input.mimeType, size: input.size });
  if (!check.ok) throw new AppError("validation_failed", check.error, { file: [check.error] });
  const canWrite = unwrap(await db.rpc("deal_room_can_write", { p_room: roomId }));
  if (!canWrite) throw new AppError("forbidden", "You can't upload to this room.");
  const path = `${roomId}/${viewer.id}/${crypto.randomUUID()}.${DEAL_ROOM_FILE_TYPES[input.mimeType]!.ext}`;
  const result = unwrap(await db.storage.from(DEAL_ROOM_BUCKET).createSignedUploadUrl(path));
  return { path: result.path, token: result.token, signedUrl: result.signedUrl };
}

export async function registerDealRoomDocument(db: DbClient, roomId: string, input: z.infer<typeof dealRoomDocumentSchema>): Promise<{ id: string }> {
  const id = unwrap(
    await db.rpc("add_deal_room_document", {
      p_room: roomId,
      p_path: input.path,
      p_file_name: input.fileName,
      p_mime: input.mimeType,
      p_size: input.size,
    }),
  );
  return { id };
}

export async function removeDealRoomDocument(db: DbClient, documentId: string) {
  unwrap(await db.rpc("remove_deal_room_document", { p_document: documentId }));
}

/**
 * Logs the access (in SQL) and returns a 60-second signed URL. Storage only lets the member read
 * a file they have just opened through this log, so there is no unlogged path to the bytes.
 */
export async function openDealRoomDocument(db: DbClient, documentId: string, action: "view" | "download"): Promise<string> {
  const rows = unwrap(await db.rpc("open_deal_room_document", { p_document: documentId, p_action: action }));
  const doc = rows?.[0];
  if (!doc) throw new AppError("not_found", "Document not found.");
  const safeName = doc.file_name.replace(/[^\w.\- ()]+/g, "_").slice(0, 150) || "document";
  const { data, error } = await db.storage
    .from(DEAL_ROOM_BUCKET)
    .createSignedUrl(doc.storage_path, 60, action === "download" ? { download: safeName } : undefined);
  if (error || !data?.signedUrl) throw new AppError("not_found", "Document not found.");
  return data.signedUrl;
}

export async function postDealRoomMessage(db: DbClient, roomId: string, body: string) {
  unwrap(await db.from("deal_room_messages").insert({ room_id: roomId, body }).select("id").single());
}
