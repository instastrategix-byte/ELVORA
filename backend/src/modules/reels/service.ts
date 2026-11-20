import "server-only";
import type { z } from "zod";
import { siteUrl } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@backend/core/logger";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getConversation, sendMessage } from "@backend/modules/messaging/service";
import { getSummaries } from "@backend/modules/profiles/service";
import { signedUrls } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { createReelSchema, shareReelSchema } from "./schemas";
import type { ReelComment, ReelView } from "./types";

export type { ReelComment, ReelView } from "./types";

const REEL_COLUMNS =
  "id, author_id, caption, video_path, poster_path, duration_s, width, height, visibility, status, like_count, comment_count, view_count, share_count, created_at";
/** Signed media URLs last long enough for a viewing session, not much longer. */
const URL_TTL_SECONDS = 1800;
const FEED_PAGE = 8;
const PROFILE_PAGE = 18;
const COMMENTS_PAGE = 30;

type ReelRow = {
  id: string;
  author_id: string;
  caption: string;
  video_path: string;
  poster_path: string | null;
  duration_s: number | string;
  width: number;
  height: number;
  visibility: string;
  status: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  share_count: number;
  created_at: string;
};

/** Adds authors, signed media URLs and the viewer's likes to a page of rows (RLS-filtered). */
async function hydrate(db: DbClient, viewer: Viewer, rows: ReelRow[]): Promise<ReelView[]> {
  if (rows.length === 0) return [];
  const paths = rows.flatMap((r) => (r.poster_path ? [r.video_path, r.poster_path] : [r.video_path]));
  const [authors, urls, likes] = await Promise.all([
    getSummaries(
      db,
      rows.map((r) => r.author_id),
    ),
    // Storage RLS decides: only viewers who can see the reel can sign its files.
    signedUrls(db, "reels", paths, URL_TTL_SECONDS),
    db
      .from("reel_likes")
      .select("reel_id")
      .eq("user_id", viewer.id)
      .in(
        "reel_id",
        rows.map((r) => r.id),
      ),
  ]);
  const liked = new Set(unwrap(likes).map((l) => l.reel_id));
  return rows
    .filter((r) => authors.has(r.author_id))
    .map((r) => ({
      id: r.id,
      author: authors.get(r.author_id)!,
      caption: r.caption,
      videoUrl: urls.get(r.video_path) ?? null,
      posterUrl: r.poster_path ? (urls.get(r.poster_path) ?? null) : null,
      durationS: Number(r.duration_s),
      width: r.width,
      height: r.height,
      visibility: r.visibility === "connections" ? "connections" : "members",
      status: r.status as ReelView["status"],
      likeCount: r.like_count,
      commentCount: r.comment_count,
      viewCount: r.view_count,
      shareCount: r.share_count,
      likedByViewer: liked.has(r.id),
      isOwn: r.author_id === viewer.id,
      createdAt: r.created_at,
    }));
}

/** The ranked reels feed (see reel_feed in the migration). `exclude` holds ids already shown. */
export async function listReelFeed(db: DbClient, viewer: Viewer, exclude: string[] = []): Promise<{ items: ReelView[]; hasMore: boolean }> {
  const rows = unwrap(await db.rpc("reel_feed", { p_limit: FEED_PAGE + 1, p_exclude: exclude })) as ReelRow[];
  const items = await hydrate(db, viewer, rows.slice(0, FEED_PAGE));
  return { items, hasMore: rows.length > FEED_PAGE };
}

/** A member's reels, newest first. Authors also see their own hidden/removed reels. */
export async function listReelsByAuthor(
  db: DbClient,
  viewer: Viewer,
  authorId: string,
  before?: string,
): Promise<{ items: ReelView[]; hasMore: boolean }> {
  let query = db
    .from("reels")
    .select(REEL_COLUMNS)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false })
    .limit(PROFILE_PAGE + 1);
  if (authorId !== viewer.id) query = query.eq("status", "published");
  if (before) query = query.lt("created_at", before);
  const rows = unwrap(await query) as ReelRow[];
  return { items: await hydrate(db, viewer, rows.slice(0, PROFILE_PAGE)), hasMore: rows.length > PROFILE_PAGE };
}

export async function getReel(db: DbClient, viewer: Viewer, id: string): Promise<ReelView | null> {
  const row = unwrap(await db.from("reels").select(REEL_COLUMNS).eq("id", id).maybeSingle()) as ReelRow | null;
  if (!row) return null;
  return (await hydrate(db, viewer, [row]))[0] ?? null;
}

async function requireReel(db: DbClient, viewer: Viewer, id: string): Promise<ReelView> {
  const reel = await getReel(db, viewer, id);
  if (!reel) throw new AppError("not_found", "This reel isn't available.");
  return reel;
}

export async function createReel(db: DbClient, viewer: Viewer, input: z.infer<typeof createReelSchema>): Promise<ReelView> {
  // The database re-checks ownership (path CHECKs), that the files exist, and the daily limit.
  if (!input.videoPath.startsWith(`${viewer.id}/reel_video/`) || (input.posterPath && !input.posterPath.startsWith(`${viewer.id}/reel_poster/`))) {
    throw new AppError("forbidden", "You can only post your own uploads.");
  }
  const row = unwrap(
    await db
      .from("reels")
      .insert({
        author_id: viewer.id,
        caption: input.caption,
        video_path: input.videoPath,
        poster_path: input.posterPath ?? null,
        duration_s: Math.round(input.durationS * 100) / 100,
        width: input.width,
        height: input.height,
        visibility: input.visibility,
      })
      .select(REEL_COLUMNS)
      .single(),
    "Your reel could not be posted.",
  ) as ReelRow;
  return (await hydrate(db, viewer, [row]))[0]!;
}

/** Deletes one of the viewer's reels (moderators may delete any) and its files. */
export async function deleteReel(db: DbClient, viewer: Viewer, id: string): Promise<void> {
  const row = unwrap(await db.from("reels").select("id, author_id, video_path, poster_path").eq("id", id).maybeSingle());
  if (!row) throw new AppError("not_found", "This reel isn't available.");
  const deleted = unwrap(await db.from("reels").delete().eq("id", id).select("id"));
  if (deleted.length === 0) throw new AppError("forbidden", "You can only delete your own reels.");
  if (row.author_id === viewer.id) {
    // Storage RLS lets authors remove files in their own folder.
    const paths = [row.video_path, row.poster_path].filter((p): p is string => Boolean(p));
    const { error } = await db.storage.from("reels").remove(paths);
    if (error) logger.warn("reels.delete.storage_cleanup_failed", { reelId: id });
  }
}

export async function setReelLike(db: DbClient, viewer: Viewer, id: string, like: boolean): Promise<{ liked: boolean; likeCount: number }> {
  if (like) {
    const { error } = await db.from("reel_likes").insert({ reel_id: id, user_id: viewer.id });
    if (error?.code === "42501") throw new AppError("not_found", "This reel isn't available.");
    if (error && error.code !== "23505") throwIfError(error, "Your like could not be saved.");
  } else {
    unwrap(await db.from("reel_likes").delete().eq("reel_id", id).eq("user_id", viewer.id));
  }
  const reel = unwrap(await db.from("reels").select("like_count").eq("id", id).maybeSingle());
  if (!reel) throw new AppError("not_found", "This reel isn't available.");
  return { liked: like, likeCount: reel.like_count };
}

export async function recordReelView(db: DbClient, id: string): Promise<void> {
  unwrap(await db.rpc("record_reel_view", { p_reel: id }));
}

export async function listReelComments(
  db: DbClient,
  viewer: Viewer,
  reelId: string,
  before?: string,
): Promise<{ items: ReelComment[]; hasMore: boolean }> {
  const reel = await requireReel(db, viewer, reelId);
  let query = db
    .from("reel_comments")
    .select("id, author_id, body, created_at")
    .eq("reel_id", reelId)
    .order("created_at", { ascending: false })
    .limit(COMMENTS_PAGE + 1);
  if (before) query = query.lt("created_at", before);
  const rows = unwrap(await query);
  const page = rows.slice(0, COMMENTS_PAGE);
  const authors = await getSummaries(
    db,
    page.map((c) => c.author_id),
  );
  const moderator = viewer.staffRole !== null;
  return {
    items: page
      .filter((c) => authors.has(c.author_id))
      .map((c) => ({
        id: c.id,
        author: authors.get(c.author_id)!,
        body: c.body,
        createdAt: c.created_at,
        canDelete: c.author_id === viewer.id || reel.isOwn || moderator,
      })),
    hasMore: rows.length > COMMENTS_PAGE,
  };
}

export async function addReelComment(db: DbClient, viewer: Viewer, reelId: string, body: string): Promise<ReelComment> {
  const { data, error } = await db.from("reel_comments").insert({ reel_id: reelId, author_id: viewer.id, body }).select("id, created_at").single();
  if (error?.code === "42501") throw new AppError("not_found", "This reel isn't available.");
  throwIfError(error, "Your comment could not be posted.");
  const authors = await getSummaries(db, [viewer.id]);
  return { id: data!.id, author: authors.get(viewer.id)!, body, createdAt: data!.created_at, canDelete: true };
}

export async function deleteReelComment(db: DbClient, reelId: string, commentId: string): Promise<void> {
  const deleted = unwrap(await db.from("reel_comments").delete().eq("id", commentId).eq("reel_id", reelId).select("id"));
  if (deleted.length === 0) throw new AppError("not_found", "Comment not found.");
}

/**
 * Sends a reel to one or more conversations as a message containing its link (rendered as a
 * reel card in the thread). Recipients still need permission to view the reel to watch it.
 */
export async function shareReel(
  db: DbClient,
  viewer: Viewer,
  reelId: string,
  input: z.infer<typeof shareReelSchema>,
): Promise<{ sent: number; failed: string[] }> {
  await requireReel(db, viewer, reelId);
  const link = siteUrl(`/reels/${reelId}`);
  const body = input.note ? `${input.note}\n${link}` : link;
  let sent = 0;
  const failed: string[] = [];
  for (const conversationId of [...new Set(input.conversationIds)]) {
    try {
      const conversation = await getConversation(db, viewer, conversationId);
      if (!conversation?.canSend) throw new AppError("forbidden", "You can't message this member.");
      await sendMessage(db, viewer, conversationId, { body, clientId: crypto.randomUUID(), attachments: [] });
      unwrap(await db.from("reel_shares").insert({ reel_id: reelId, user_id: viewer.id, conversation_id: conversationId }));
      sent += 1;
    } catch (error) {
      logger.warn("reels.share.failed", { reelId, code: error instanceof AppError ? error.code : "internal" });
      failed.push(conversationId);
    }
  }
  if (sent === 0) throw new AppError("forbidden", "The reel couldn't be sent. You may not be able to message these members.");
  return { sent, failed };
}
