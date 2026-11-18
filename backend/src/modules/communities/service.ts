import "server-only";
import { AppError } from "@/lib/errors";
import { publicMediaUrl } from "@/lib/media";
import { decodeCursor, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import { isStaff, type Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { PRIVATE_MEMBER } from "@backend/modules/profiles/types";
import { assertOwnedPath } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import { slugify, type CommunityInput } from "./schemas";
import type {
  CommunityCard,
  CommunityDetail,
  CommunityMemberStatus,
  CommunityMemberView,
  CommunityRole,
  ReplyView,
  ThreadDetail,
  ThreadSummary,
} from "./types";

export type * from "./types";

const PAGE = 20;
const COMMUNITY_COLUMNS = "id, slug, name, description, category, visibility, cover_path, created_by, member_count, archived_at, created_at";
const THREAD_COLUMNS = "id, community_id, author_id, title, body, pinned, locked, reply_count, last_activity_at, created_at, updated_at";

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  visibility: CommunityCard["visibility"];
  cover_path: string | null;
  created_by: string;
  member_count: number;
  archived_at: string | null;
  created_at: string;
};

type ThreadRow = {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

/** Strips PostgREST filter syntax so user input can't alter a filter expression. */
const clean = (s: string | undefined) => s?.replace(/[%,()*\\"]/g, " ").trim() || undefined;

const unknownMember = (id: string) => ({ id, ...PRIVATE_MEMBER });

async function myMemberships(db: DbClient, viewer: Viewer, ids: string[]) {
  if (ids.length === 0) return new Map<string, { role: CommunityRole; status: CommunityMemberStatus }>();
  const rows = unwrap(await db.from("community_members").select("community_id, role, status").eq("user_id", viewer.id).in("community_id", ids));
  return new Map(rows.map((r) => [r.community_id, { role: r.role as CommunityRole, status: r.status as CommunityMemberStatus }]));
}

async function toCards(db: DbClient, viewer: Viewer, rows: CommunityRow[]): Promise<CommunityCard[]> {
  const mine = await myMemberships(
    db,
    viewer,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const m = mine.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      visibility: r.visibility,
      coverUrl: publicMediaUrl("profile-media", r.cover_path),
      memberCount: r.member_count,
      archived: r.archived_at !== null,
      createdAt: r.created_at,
      myRole: m?.role ?? null,
      myStatus: m?.status ?? null,
    };
  });
}

/** all: live communities, newest first (paginated). joined: communities the viewer belongs to or asked to join. */
export async function listCommunities(
  db: DbClient,
  viewer: Viewer,
  opts: { filter?: "all" | "joined"; q?: string; category?: string; cursor?: string } = {},
): Promise<Page<CommunityCard>> {
  const q = clean(opts.q);
  if (opts.filter === "joined") {
    const memberships = unwrap(
      await db.from("community_members").select("community_id").eq("user_id", viewer.id).in("status", ["active", "pending"]).limit(200),
    );
    const ids = memberships.map((m) => m.community_id);
    if (ids.length === 0) return { items: [], nextCursor: null };
    let query = db.from("communities").select(COMMUNITY_COLUMNS).in("id", ids).order("name").limit(200);
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    if (opts.category) query = query.eq("category", opts.category);
    const rows = unwrap(await query) as CommunityRow[];
    return { items: await toCards(db, viewer, rows), nextCursor: null };
  }

  let query = db
    .from("communities")
    .select(COMMUNITY_COLUMNS)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  if (opts.category) query = query.eq("category", opts.category);
  const cursor = decodeCursor(opts.cursor);
  if (cursor) query = query.or(`created_at.lt.${cursor.t},and(created_at.eq.${cursor.t},id.lt.${cursor.id})`);
  const rows = unwrap(await query) as CommunityRow[];
  const page = toPage(rows, PAGE, (r) => ({ t: r.created_at, id: r.id }));
  return { items: await toCards(db, viewer, page.items), nextCursor: page.nextCursor };
}

/** For the dashboard: active memberships, most active communities first. */
export async function listJoinedCommunitiesForDashboard(db: DbClient, viewer: Viewer, limit = 4): Promise<CommunityCard[]> {
  const memberships = unwrap(await db.from("community_members").select("community_id").eq("user_id", viewer.id).eq("status", "active").limit(200));
  const ids = memberships.map((m) => m.community_id);
  if (ids.length === 0) return [];
  const rows = unwrap(
    await db.from("communities").select(COMMUNITY_COLUMNS).in("id", ids).is("archived_at", null).order("member_count", { ascending: false }).limit(limit),
  ) as CommunityRow[];
  return toCards(db, viewer, rows);
}

export async function getCommunity(db: DbClient, viewer: Viewer, slug: string): Promise<CommunityDetail | null> {
  const row = unwrap(await db.from("communities").select(COMMUNITY_COLUMNS).eq("slug", slug).maybeSingle()) as CommunityRow | null;
  if (!row) return null;
  const [cards, people] = await Promise.all([toCards(db, viewer, [row]), getSummaries(db, [row.created_by])]);
  const card = cards[0]!;
  const active = card.myStatus === "active";
  const staff = isStaff(viewer, "moderator");
  return {
    ...card,
    coverPath: row.cover_path,
    createdBy: people.get(row.created_by) ?? unknownMember(row.created_by),
    // Mirrors can_view_community_content(); RLS is the real gate.
    canRead: isStaff(viewer) || active || (row.visibility === "open" && !card.archived),
    canPost: active && !card.archived,
    canModerate: (active && (card.myRole === "owner" || card.myRole === "moderator")) || staff,
    isOwner: active && card.myRole === "owner",
  };
}

export async function getCommunityById(db: DbClient, id: string): Promise<{ id: string; slug: string } | null> {
  return unwrap(await db.from("communities").select("id, slug").eq("id", id).maybeSingle());
}

function toRow(viewer: Viewer, input: Omit<CommunityInput, "slug">) {
  if (input.coverPath) assertOwnedPath(viewer, input.coverPath);
  return {
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    visibility: input.visibility,
    cover_path: input.coverPath ?? null,
  };
}

export async function createCommunity(db: DbClient, viewer: Viewer, input: CommunityInput): Promise<{ id: string; slug: string }> {
  const base = input.slug ?? slugify(input.name);
  if (base.length < 3) throw new AppError("validation_failed", "Choose a longer name.", { name: ["Choose a longer name"] });
  // Try the requested slug, then a few suffixed variants if it is taken (only when it was auto-generated).
  const candidates = input.slug ? [base] : [base, ...Array.from({ length: 4 }, () => `${base}-${Math.random().toString(36).slice(2, 6)}`)];
  for (const slug of candidates) {
    const { data, error } = await db
      .from("communities")
      .insert({ ...toRow(viewer, input), slug, created_by: viewer.id })
      .select("id, slug")
      .single();
    if (!error) return data;
    if (error.code === "23505") continue;
    if (error.code === "42501") throw new AppError("forbidden", "Creating communities isn't included in your current membership.");
    throwIfError(error, "The community could not be created.");
  }
  throw new AppError("conflict", "That address is taken. Choose another.", { slug: ["That address is taken"] });
}

export async function updateCommunity(db: DbClient, viewer: Viewer, id: string, input: Omit<CommunityInput, "slug">) {
  const rows = unwrap(await db.from("communities").update(toRow(viewer, input)).eq("id", id).select("id"), "The community could not be saved.");
  if (rows.length === 0) throw new AppError("forbidden", "Only the owner can edit this community.");
}

export async function setArchived(db: DbClient, id: string, archived: boolean) {
  const rows = unwrap(
    await db
      .from("communities")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id"),
  );
  if (rows.length === 0) throw new AppError("forbidden", "Only the owner can archive this community.");
}

/** Open communities: instant. Private: a pending request. The database decides which. */
export async function joinCommunity(db: DbClient, viewer: Viewer, communityId: string): Promise<{ status: CommunityMemberStatus }> {
  const { data, error } = await db.from("community_members").insert({ community_id: communityId, user_id: viewer.id }).select("status").single();
  if (error?.code === "23505") {
    const existing = unwrap(await db.from("community_members").select("status").eq("community_id", communityId).eq("user_id", viewer.id).maybeSingle());
    if (existing?.status === "banned") throw new AppError("forbidden", "You can't rejoin this community.");
    return { status: (existing?.status ?? "active") as CommunityMemberStatus };
  }
  if (error?.code === "42501") throw new AppError("forbidden", "This community isn't accepting new members.");
  throwIfError(error);
  return { status: data!.status as CommunityMemberStatus };
}

/** Leave, or withdraw a pending request. Owners can't leave (they archive instead). */
export async function leaveCommunity(db: DbClient, viewer: Viewer, communityId: string) {
  const rows = unwrap(await db.from("community_members").delete().eq("community_id", communityId).eq("user_id", viewer.id).select("user_id"));
  if (rows.length === 0) throw new AppError("business_rule", "You can't leave this community. Owners can archive it instead.");
}

export async function manageMember(
  db: DbClient,
  communityId: string,
  userId: string,
  action: "approve" | "decline" | "ban" | "unban" | "remove" | "promote" | "demote",
) {
  if (action === "decline" || action === "remove") {
    const rows = unwrap(await db.from("community_members").delete().eq("community_id", communityId).eq("user_id", userId).select("user_id"));
    if (rows.length === 0) throw new AppError("forbidden", "You can't remove this member.");
    return;
  }
  const patch =
    action === "approve" || action === "unban"
      ? { status: "active" as const }
      : action === "ban"
        ? { status: "banned" as const, role: "member" as const }
        : { role: action === "promote" ? ("moderator" as const) : ("member" as const) };
  const rows = unwrap(await db.from("community_members").update(patch).eq("community_id", communityId).eq("user_id", userId).select("user_id"));
  if (rows.length === 0) throw new AppError("forbidden", "You don't have permission to manage this member.");
}

/** RLS decides who appears: active rosters for readers; pending and banned for moderators. */
export async function listMembers(
  db: DbClient,
  communityId: string,
  status: CommunityMemberStatus = "active",
): Promise<CommunityMemberView[]> {
  const rows = unwrap(
    await db
      .from("community_members")
      .select("user_id, role, status, joined_at")
      .eq("community_id", communityId)
      .eq("status", status)
      .order("role")
      .order("joined_at")
      .limit(500),
  );
  const people = await getSummaries(
    db,
    rows.map((r) => r.user_id),
  );
  const rank: Record<CommunityRole, number> = { owner: 0, moderator: 1, member: 2 };
  return rows
    .map((r) => ({
      profile: people.get(r.user_id) ?? unknownMember(r.user_id),
      role: r.role as CommunityRole,
      status: r.status as CommunityMemberStatus,
      joinedAt: r.joined_at,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role]);
}

async function toThreads(db: DbClient, viewer: Viewer, rows: ThreadRow[]): Promise<ThreadSummary[]> {
  const people = await getSummaries(
    db,
    rows.map((r) => r.author_id),
  );
  return rows.map((r) => ({
    id: r.id,
    communityId: r.community_id,
    title: r.title,
    excerpt: r.body.length > 220 ? `${r.body.slice(0, 220).trimEnd()}…` : r.body,
    author: people.get(r.author_id) ?? unknownMember(r.author_id),
    pinned: r.pinned,
    locked: r.locked,
    replyCount: r.reply_count,
    lastActivityAt: r.last_activity_at,
    createdAt: r.created_at,
    isOwn: r.author_id === viewer.id,
  }));
}

/** Pinned threads lead the first page; the rest follow by latest activity (keyset). */
export async function listThreads(db: DbClient, viewer: Viewer, communityId: string, cursorRaw?: string): Promise<Page<ThreadSummary>> {
  const cursor = decodeCursor(cursorRaw);
  const pinned = cursor
    ? []
    : (unwrap(
        await db.from("community_threads").select(THREAD_COLUMNS).eq("community_id", communityId).eq("pinned", true).order("last_activity_at", { ascending: false }).limit(10),
      ) as ThreadRow[]);
  let query = db
    .from("community_threads")
    .select(THREAD_COLUMNS)
    .eq("community_id", communityId)
    .eq("pinned", false)
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (cursor) query = query.or(`last_activity_at.lt.${cursor.t},and(last_activity_at.eq.${cursor.t},id.lt.${cursor.id})`);
  const rows = unwrap(await query) as ThreadRow[];
  const page = toPage(rows, PAGE, (r) => ({ t: r.last_activity_at, id: r.id }));
  return { items: await toThreads(db, viewer, [...pinned, ...page.items]), nextCursor: page.nextCursor };
}

export async function getThread(db: DbClient, viewer: Viewer, threadId: string): Promise<ThreadDetail | null> {
  const row = unwrap(await db.from("community_threads").select(THREAD_COLUMNS).eq("id", threadId).maybeSingle()) as ThreadRow | null;
  if (!row) return null;
  const [summary] = await toThreads(db, viewer, [row]);
  return { ...summary!, body: row.body, updatedAt: row.updated_at };
}

export async function createThread(db: DbClient, viewer: Viewer, communityId: string, input: { title: string; body: string }): Promise<{ id: string }> {
  const { data, error } = await db
    .from("community_threads")
    .insert({ community_id: communityId, author_id: viewer.id, title: input.title, body: input.body })
    .select("id")
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "Join this community to start a discussion.");
  throwIfError(error, "The discussion could not be started.");
  return { id: data!.id };
}

export async function updateThread(
  db: DbClient,
  threadId: string,
  patch: { title?: string; body?: string; pinned?: boolean; locked?: boolean },
): Promise<void> {
  const rows = unwrap(await db.from("community_threads").update(patch).eq("id", threadId).select("id"));
  if (rows.length === 0) throw new AppError("forbidden", "You can't change this discussion.");
}

export async function deleteThread(db: DbClient, threadId: string) {
  const rows = unwrap(await db.from("community_threads").delete().eq("id", threadId).select("id"));
  if (rows.length === 0) throw new AppError("forbidden", "You can't delete this discussion.");
}

/** Replies oldest first, keyset-paginated. */
export async function listReplies(db: DbClient, viewer: Viewer, threadId: string, cursorRaw?: string): Promise<Page<ReplyView>> {
  let query = db
    .from("community_replies")
    .select("id, thread_id, author_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE * 2 + 1);
  const cursor = decodeCursor(cursorRaw);
  if (cursor) query = query.or(`created_at.gt.${cursor.t},and(created_at.eq.${cursor.t},id.gt.${cursor.id})`);
  const rows = unwrap(await query);
  const page = toPage(rows, PAGE * 2, (r) => ({ t: r.created_at, id: r.id }));
  const people = await getSummaries(
    db,
    page.items.map((r) => r.author_id),
  );
  return {
    items: page.items.map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      author: people.get(r.author_id) ?? unknownMember(r.author_id),
      body: r.body,
      createdAt: r.created_at,
      isOwn: r.author_id === viewer.id,
    })),
    nextCursor: page.nextCursor,
  };
}

export async function createReply(db: DbClient, viewer: Viewer, threadId: string, body: string): Promise<ReplyView> {
  const { data, error } = await db
    .from("community_replies")
    .insert({ thread_id: threadId, author_id: viewer.id, body })
    .select("id, thread_id, created_at")
    .single();
  if (error?.code === "42501") throw new AppError("forbidden", "This discussion is locked, or you need to join the community to reply.");
  throwIfError(error, "Your reply could not be posted.");
  const people = await getSummaries(db, [viewer.id]);
  return {
    id: data!.id,
    threadId: data!.thread_id,
    author: people.get(viewer.id) ?? unknownMember(viewer.id),
    body,
    createdAt: data!.created_at,
    isOwn: true,
  };
}

export async function deleteReply(db: DbClient, replyId: string) {
  const rows = unwrap(await db.from("community_replies").delete().eq("id", replyId).select("id"));
  if (rows.length === 0) throw new AppError("forbidden", "You can't delete this reply.");
}
