import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { decodeCursor, olderThanFilter, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { assertOwnedPath, signedUrls } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { commentSchema, createPostSchema, pollVoteSchema, reportSchema, updatePostSchema } from "./schemas";
import type { CommentView, PostPoll, PostView, TrendingTag } from "./types";

const PAGE_SIZE = 15;
const POST_COLUMNS = "id, author_id, body, visibility, status, like_count, comment_count, repost_count, created_at, updated_at";

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  visibility: PostView["visibility"];
  like_count: number;
  comment_count: number;
  repost_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * Turns post rows into views. `reposters` maps post id -> the network member whose repost put
 * the post in this feed (used for the "X reposted" line).
 */
async function hydrate(db: DbClient, viewer: Viewer | null, rows: PostRow[], reposters?: Map<string, string>): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const none = Promise.resolve({ data: [], error: null });
  const [authors, mediaRes, likesRes, savesRes, repostsRes, polls] = await Promise.all([
    getSummaries(db, [...rows.map((r) => r.author_id), ...(reposters ? [...reposters.values()] : [])]),
    db.from("post_media").select("id, post_id, storage_path, media_type, alt_text, position").in("post_id", ids).order("position"),
    viewer ? db.from("post_likes").select("post_id").eq("user_id", viewer.id).in("post_id", ids) : Promise.resolve({ data: [], error: null }),
    viewer ? db.from("post_saves").select("post_id").eq("user_id", viewer.id).in("post_id", ids) : none,
    viewer ? db.from("post_reposts").select("post_id").eq("user_id", viewer.id).in("post_id", ids) : none,
    loadPolls(db, ids),
  ]);
  const media = unwrap(mediaRes);
  const urls = await signedUrls(db, "post-media", media.map((m) => m.storage_path));
  const liked = new Set(unwrap(likesRes).map((l) => l.post_id));
  const saved = new Set(unwrap(savesRes).map((s) => s.post_id));
  const reposted = new Set(unwrap(repostsRes).map((s) => s.post_id));

  return rows.map((r) => ({
    id: r.id,
    author: authors.get(r.author_id)!,
    body: r.body,
    visibility: r.visibility,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    repostCount: r.repost_count,
    likedByViewer: liked.has(r.id),
    savedByViewer: saved.has(r.id),
    repostedByViewer: reposted.has(r.id),
    repostedBy: reposters?.has(r.id) ? (authors.get(reposters.get(r.id)!) ?? null) : null,
    isOwn: viewer?.id === r.author_id,
    media: media
      .filter((m) => m.post_id === r.id)
      .map((m) => ({ id: m.id, type: m.media_type, url: urls.get(m.storage_path) ?? null, alt: m.alt_text })),
    poll: polls.get(r.id) ?? null,
  }));
}

/** Poll results for a page of posts in one call. Counts only; visibility is checked in SQL. */
async function loadPolls(db: DbClient, postIds: string[]): Promise<Map<string, PostPoll>> {
  const map = new Map<string, PostPoll>();
  if (postIds.length === 0) return map;
  const rows = unwrap(await db.rpc("poll_results", { p_posts: postIds })) ?? [];
  const now = Date.now();
  for (const r of rows) {
    let poll = map.get(r.post_id);
    if (!poll) {
      poll = {
        question: r.question,
        options: [],
        totalVotes: 0,
        closesAt: r.closes_at,
        closed: new Date(r.closes_at).getTime() <= now,
        allowMultiple: r.allow_multiple,
      };
      map.set(r.post_id, poll);
    }
    poll.options.push({ id: r.option_id, label: r.label, votes: Number(r.votes), voted: r.viewer_voted });
    poll.totalVotes += Number(r.votes);
  }
  return map;
}

/** Records (or replaces) the viewer's vote and returns fresh aggregate results. */
export async function votePoll(db: DbClient, postId: string, input: z.infer<typeof pollVoteSchema>): Promise<PostPoll> {
  unwrap(await db.rpc("vote_poll", { p_post: postId, p_options: input.optionIds }));
  const poll = (await loadPolls(db, [postId])).get(postId);
  if (!poll) throw new AppError("not_found", "Poll not found.");
  return poll;
}

/** Removes the viewer's vote while the poll is open. */
export async function clearPollVote(db: DbClient, postId: string): Promise<PostPoll> {
  unwrap(await db.rpc("clear_poll_vote", { p_post: postId }));
  const poll = (await loadPolls(db, [postId])).get(postId);
  if (!poll) throw new AppError("not_found", "Poll not found.");
  return poll;
}

const REPOST_WINDOW_DAYS = 30;
const REPOST_LOOKUP_LIMIT = 300;

/**
 * Feed: "network" = the viewer's own posts, posts by connections and follows, and posts those
 * people reposted in the last 30 days; "all" = every post the viewer may see. Visibility is
 * enforced by RLS (can_view_post); this only narrows.
 *
 * Reposts widen the *set* of posts; ordering stays by the post's own creation time. That keeps
 * keyset pagination exact (one stable sort key) at the cost of a reposted older post appearing
 * at its original position rather than at the time it was reposted.
 */
export async function listFeed(
  db: DbClient,
  viewer: Viewer,
  opts: { scope: "network" | "all"; cursor?: string; authorId?: string; q?: string },
): Promise<Page<PostView>> {
  const reposters = new Map<string, string>();
  let networkAuthors: Set<string> | null = null;
  let query = db
    .from("posts")
    .select(POST_COLUMNS)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (opts.authorId) {
    query = query.eq("author_id", opts.authorId);
  } else if (opts.scope === "network") {
    const [conns, follows] = await Promise.all([
      db.from("connections").select("requester_id, addressee_id").eq("status", "accepted").limit(1000),
      db.from("follows").select("followee_id").eq("follower_id", viewer.id).limit(1000),
    ]);
    const authorIds = new Set<string>([viewer.id]);
    for (const c of unwrap(conns)) authorIds.add(c.requester_id === viewer.id ? c.addressee_id : c.requester_id);
    for (const f of unwrap(follows)) authorIds.add(f.followee_id);

    const since = new Date(Date.now() - REPOST_WINDOW_DAYS * 86_400_000).toISOString();
    const reposts = unwrap(
      await db
        .from("post_reposts")
        .select("post_id, user_id, created_at")
        .in("user_id", [...authorIds])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(REPOST_LOOKUP_LIMIT),
    );
    for (const r of reposts) {
      // Most recent network repost wins; the viewer's own reposts don't need a "reposted" line.
      if (!reposters.has(r.post_id) && r.user_id !== viewer.id) reposters.set(r.post_id, r.user_id);
    }
    const repostedIds = [...new Set(reposts.map((r) => r.post_id))];
    query =
      repostedIds.length > 0
        ? query.or(`author_id.in.(${[...authorIds].join(",")}),id.in.(${repostedIds.join(",")})`)
        : query.in("author_id", [...authorIds]);
    networkAuthors = authorIds;
  }

  // Text search: PostgREST filter syntax characters are stripped, so input can't alter the filter.
  const q = opts.q?.replace(/[%,()*\\]/g, " ").trim();
  if (q) query = query.ilike("body", `%${q}%`);

  const cursor = decodeCursor(opts.cursor);
  if (cursor) query = query.or(olderThanFilter(cursor));
  const rows = unwrap(await query);
  const page = toPage(rows, PAGE_SIZE, (r) => ({ t: r.created_at, id: r.id }));
  // Only label reposts for posts that are here *because of* the repost.
  if (networkAuthors) for (const r of page.items) if (networkAuthors.has(r.author_id)) reposters.delete(r.id);
  return { items: await hydrate(db, viewer, page.items, reposters), nextCursor: page.nextCursor };
}

/** Public posts for a guest-visible profile page. */
export async function listAuthorPosts(db: DbClient, viewer: Viewer | null, authorId: string, cursor?: string): Promise<Page<PostView>> {
  let query = db
    .from("posts")
    .select(POST_COLUMNS)
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  const c = decodeCursor(cursor);
  if (c) query = query.or(olderThanFilter(c));
  const rows = unwrap(await query);
  const page = toPage(rows, PAGE_SIZE, (r) => ({ t: r.created_at, id: r.id }));
  return { items: await hydrate(db, viewer, page.items), nextCursor: page.nextCursor };
}

export async function getPost(db: DbClient, viewer: Viewer | null, postId: string): Promise<PostView | null> {
  const row = unwrap(await db.from("posts").select(POST_COLUMNS).eq("id", postId).eq("status", "published").maybeSingle());
  if (!row) return null;
  const [post] = await hydrate(db, viewer, [row]);
  return post ?? null;
}

export async function listSavedPosts(db: DbClient, viewer: Viewer, cursor?: string): Promise<Page<PostView>> {
  let query = db
    .from("post_saves")
    .select("post_id, created_at")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .order("post_id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  const c = decodeCursor(cursor);
  if (c) query = query.or(`created_at.lt.${c.t},and(created_at.eq.${c.t},post_id.lt.${c.id})`);
  const saves = unwrap(await query);
  const page = toPage(saves, PAGE_SIZE, (s) => ({ t: s.created_at, id: s.post_id }));
  const ids = page.items.map((s) => s.post_id);
  if (ids.length === 0) return { items: [], nextCursor: null };
  const rows = unwrap(await db.from("posts").select(POST_COLUMNS).in("id", ids).eq("status", "published"));
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { items: await hydrate(db, viewer, rows), nextCursor: page.nextCursor };
}

/**
 * Creates a post with attachments. Attachments are validated to be the viewer's own uploads;
 * if attaching fails, the post is deleted so the operation is all-or-nothing.
 */
export async function createPost(db: DbClient, viewer: Viewer, input: z.infer<typeof createPostSchema>): Promise<PostView> {
  for (const a of input.attachments) assertOwnedPath(viewer, a.path);
  const post = unwrap(
    await db.from("posts").insert({ author_id: viewer.id, body: input.body, visibility: input.visibility }).select(POST_COLUMNS).single(),
  );
  if (input.attachments.length > 0) {
    const { error } = await db.from("post_media").insert(
      input.attachments.map((a, i) => ({
        post_id: post.id,
        owner_id: viewer.id,
        storage_path: a.path,
        media_type: a.type,
        alt_text: a.alt ?? null,
        position: i,
      })),
    );
    if (error) {
      await db.from("posts").delete().eq("id", post.id);
      throwIfError(error, "Attachments could not be saved.");
    }
  }
  if (input.poll) {
    const { error } = await db.rpc("create_post_poll", {
      p_post: post.id,
      p_options: input.poll.options,
      p_allow_multiple: input.poll.allowMultiple,
      p_duration_hours: input.poll.durationHours,
    });
    if (error) {
      // Nothing half-exists: a post meant to carry a poll is removed if the poll can't be created.
      await db.from("posts").delete().eq("id", post.id);
      throwIfError(error, "The poll could not be created.");
    }
  }
  const [view] = await hydrate(db, viewer, [post]);
  return view!;
}

export async function updatePost(db: DbClient, viewer: Viewer, postId: string, input: z.infer<typeof updatePostSchema>) {
  const patch: { body?: string; visibility?: PostView["visibility"] } = {};
  if (input.body !== undefined) patch.body = input.body;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  const rows = unwrap(await db.from("posts").update(patch).eq("id", postId).eq("author_id", viewer.id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Post not found or not yours to edit.");
}

export async function deletePost(db: DbClient, viewer: Viewer, postId: string) {
  const media = unwrap(await db.from("post_media").select("storage_path").eq("post_id", postId).eq("owner_id", viewer.id));
  const rows = unwrap(await db.from("posts").delete().eq("id", postId).eq("author_id", viewer.id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Post not found or not yours to delete.");
  if (media.length) await db.storage.from("post-media").remove(media.map((m) => m.storage_path));
}

export async function setLike(db: DbClient, viewer: Viewer, postId: string, liked: boolean): Promise<{ likeCount: number }> {
  if (liked) {
    const { error } = await db.from("post_likes").insert({ post_id: postId, user_id: viewer.id });
    if (error && error.code !== "23505") throwIfError(error);
  } else {
    unwrap(await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", viewer.id));
  }
  const post = unwrap(await db.from("posts").select("like_count").eq("id", postId).maybeSingle());
  if (!post) throw new AppError("not_found", "Post not found.");
  return { likeCount: post.like_count };
}

/** Reposts (or un-reposts) a post; the database refuses own and connections-only posts. */
export async function setRepost(db: DbClient, viewer: Viewer, postId: string, reposted: boolean): Promise<{ repostCount: number }> {
  if (reposted) {
    const { error } = await db.from("post_reposts").insert({ post_id: postId, user_id: viewer.id });
    if (error && error.code !== "23505") {
      if (error.code === "42501") throw new AppError("forbidden", "This post can't be reposted.");
      throwIfError(error);
    }
  } else {
    unwrap(await db.from("post_reposts").delete().eq("post_id", postId).eq("user_id", viewer.id));
  }
  const post = unwrap(await db.from("posts").select("repost_count").eq("id", postId).maybeSingle());
  if (!post) throw new AppError("not_found", "Post not found.");
  return { repostCount: post.repost_count };
}

/** Hashtags trending across posts every member can see (aggregates only; see trending_hashtags). */
export async function listTrendingTags(db: DbClient, limit = 8): Promise<TrendingTag[]> {
  const rows = unwrap(await db.rpc("trending_hashtags", { p_days: 7, p_limit: limit }));
  return rows.map((r) => ({ tag: r.tag, postCount: r.post_count }));
}

export async function setSaved(db: DbClient, viewer: Viewer, postId: string, saved: boolean) {
  if (saved) {
    const { error } = await db.from("post_saves").insert({ post_id: postId, user_id: viewer.id });
    if (error && error.code !== "23505") throwIfError(error);
  } else {
    unwrap(await db.from("post_saves").delete().eq("post_id", postId).eq("user_id", viewer.id));
  }
}

const COMMENT_PAGE = 30;

export async function listComments(db: DbClient, viewer: Viewer | null, postId: string, cursor?: string): Promise<Page<CommentView>> {
  const post = unwrap(await db.from("posts").select("author_id").eq("id", postId).maybeSingle());
  if (!post) throw new AppError("not_found", "Post not found.");
  let query = db
    .from("post_comments")
    .select("id, post_id, author_id, body, created_at")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(COMMENT_PAGE + 1);
  const c = decodeCursor(cursor);
  if (c) query = query.or(olderThanFilter(c));
  const rows = unwrap(await query);
  const page = toPage(rows, COMMENT_PAGE, (r) => ({ t: r.created_at, id: r.id }));
  const authors = await getSummaries(db, page.items.map((r) => r.author_id));
  return {
    items: page.items.map((r) => ({
      id: r.id,
      postId: r.post_id,
      author: authors.get(r.author_id)!,
      body: r.body,
      createdAt: r.created_at,
      canDelete: Boolean(viewer && (viewer.id === r.author_id || viewer.id === post.author_id)),
    })),
    nextCursor: page.nextCursor,
  };
}

export async function addComment(db: DbClient, viewer: Viewer, postId: string, input: z.infer<typeof commentSchema>): Promise<CommentView> {
  const row = unwrap(
    await db
      .from("post_comments")
      .insert({ post_id: postId, author_id: viewer.id, body: input.body })
      .select("id, post_id, author_id, body, created_at")
      .single(),
  );
  const authors = await getSummaries(db, [viewer.id]);
  return { id: row.id, postId: row.post_id, author: authors.get(viewer.id)!, body: row.body, createdAt: row.created_at, canDelete: true };
}

export async function deleteComment(db: DbClient, commentId: string) {
  const rows = unwrap(await db.from("post_comments").delete().eq("id", commentId).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Comment not found or not yours to delete.");
}

export async function createReport(db: DbClient, viewer: Viewer, input: z.infer<typeof reportSchema>) {
  const { error } = await db.from("reports").insert({
    reporter_id: viewer.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: input.details ?? null,
  });
  if (error?.code === "23505") throw new AppError("conflict", "You have already reported this. Our team is reviewing it.");
  throwIfError(error);
}

/** Posts for specific ids, in the given order. Posts the viewer can no longer see are skipped (RLS). */
export async function getPostsByIds(db: DbClient, viewer: Viewer, ids: string[]): Promise<PostView[]> {
  if (ids.length === 0) return [];
  const rows = unwrap(await db.from("posts").select(POST_COLUMNS).in("id", ids.slice(0, 200)).eq("status", "published"));
  const views = await hydrate(db, viewer, rows);
  const byId = new Map(views.map((v) => [v.id, v]));
  return ids.map((id) => byId.get(id)).filter((v): v is PostView => Boolean(v));
}
