import "server-only";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { getSummaries } from "@backend/modules/profiles/service";
import { assertOwnedPath, signedUrls } from "@backend/modules/storage/service";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import type { createStorySchema } from "./schemas";
import type { StoryAuthorGroup, StoryView, StoryViewer } from "./types";

export type { StoryAuthorGroup, StoryView, StoryViewer } from "./types";

const STORY_COLUMNS = "id, author_id, media_path, media_type, caption, visibility, created_at, expires_at";
/** Upper bound on stories loaded for the rail (RLS already limits it to active, visible ones). */
const RAIL_LIMIT = 300;
/** Signed media URLs outlive a viewing session but not the story by much. */
const URL_TTL_SECONDS = 3600;

type StoryRow = {
  id: string;
  author_id: string;
  media_path: string;
  media_type: "image" | "video";
  caption: string | null;
  visibility: string;
  created_at: string;
  expires_at: string;
};

/**
 * The story rail: every active story the viewer may see (RLS), grouped by author. Order:
 * the viewer's own stories, then people they're connected to or follow (unseen first), then
 * everyone else (unseen first). Within a bucket, the most recently active author comes first.
 */
export async function listStoryRail(db: DbClient, viewer: Viewer): Promise<StoryAuthorGroup[]> {
  const rows = unwrap(
    await db.from("stories").select(STORY_COLUMNS).order("created_at", { ascending: true }).limit(RAIL_LIMIT),
  ) as StoryRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const ownIds = rows.filter((r) => r.author_id === viewer.id).map((r) => r.id);
  const [authors, seenRes, ownViewsRes, connRes, followRes, urls] = await Promise.all([
    getSummaries(db, rows.map((r) => r.author_id)),
    db.from("story_views").select("story_id").eq("viewer_id", viewer.id).in("story_id", ids),
    ownIds.length > 0 ? db.from("story_views").select("story_id").in("story_id", ownIds) : Promise.resolve({ data: [], error: null }),
    db.from("connections").select("requester_id, addressee_id").eq("status", "accepted").limit(1000),
    db.from("follows").select("followee_id").eq("follower_id", viewer.id).limit(1000),
    signedUrls(db, "post-media", rows.map((r) => r.media_path), URL_TTL_SECONDS),
  ]);

  const seen = new Set(unwrap(seenRes).map((v) => v.story_id));
  const viewCounts = new Map<string, number>();
  for (const v of unwrap(ownViewsRes) as { story_id: string }[]) viewCounts.set(v.story_id, (viewCounts.get(v.story_id) ?? 0) + 1);
  const network = new Set<string>();
  for (const c of unwrap(connRes)) network.add(c.requester_id === viewer.id ? c.addressee_id : c.requester_id);
  for (const f of unwrap(followRes)) network.add(f.followee_id);

  const groups = new Map<string, StoryAuthorGroup & { latest: string }>();
  for (const r of rows) {
    const isOwn = r.author_id === viewer.id;
    const story: StoryView = {
      id: r.id,
      mediaUrl: urls.get(r.media_path) ?? null,
      mediaType: r.media_type,
      caption: r.caption,
      visibility: r.visibility === "connections" ? "connections" : "members",
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      seen: isOwn || seen.has(r.id),
      isOwn,
      ...(isOwn ? { viewCount: viewCounts.get(r.id) ?? 0 } : {}),
    };
    let group = groups.get(r.author_id);
    if (!group) {
      group = { author: authors.get(r.author_id)!, stories: [], hasUnseen: false, isOwn, latest: r.created_at };
      groups.set(r.author_id, group);
    }
    group.stories.push(story);
    group.hasUnseen ||= !story.seen;
    if (r.created_at > group.latest) group.latest = r.created_at;
  }

  const bucket = (g: StoryAuthorGroup) => {
    if (g.isOwn) return 0;
    const inNetwork = network.has(g.author.id);
    if (inNetwork) return g.hasUnseen ? 1 : 2;
    return g.hasUnseen ? 3 : 4;
  };
  return [...groups.values()]
    .sort((a, b) => bucket(a) - bucket(b) || b.latest.localeCompare(a.latest))
    .map((g) => ({ author: g.author, stories: g.stories, hasUnseen: g.hasUnseen, isOwn: g.isOwn }));
}

export async function createStory(db: DbClient, viewer: Viewer, input: z.infer<typeof createStorySchema>): Promise<{ id: string }> {
  assertOwnedPath(viewer, input.mediaPath);
  return unwrap(
    await db
      .from("stories")
      .insert({
        author_id: viewer.id,
        media_path: input.mediaPath,
        media_type: input.mediaType,
        caption: input.caption ?? null,
        visibility: input.visibility,
      })
      .select("id")
      .single(),
  );
}

/** Deletes a story (RLS: author or moderator) and, for the author, its media object. */
export async function deleteStory(db: DbClient, viewer: Viewer, id: string): Promise<void> {
  const rows = unwrap(await db.from("stories").delete().eq("id", id).select("author_id, media_path")) as { author_id: string; media_path: string }[];
  const row = rows[0];
  if (!row) throw new AppError("not_found", "Story not found.");
  // Storage RLS lets owners remove their own objects; a moderator's delete leaves the file orphaned but unreadable.
  if (row.author_id === viewer.id) await db.storage.from("post-media").remove([row.media_path]);
}

/** Records that the viewer saw a story. Idempotent; RLS rejects stories the viewer can't see. */
export async function markStoryViewed(db: DbClient, viewer: Viewer, id: string): Promise<void> {
  const { error } = await db.from("story_views").upsert({ story_id: id, viewer_id: viewer.id }, { onConflict: "story_id,viewer_id", ignoreDuplicates: true });
  throwIfError(error, "We couldn't record that view.");
}

/** Who viewed one of the viewer's own stories (RLS returns nothing for other people's stories). */
export async function listStoryViewers(db: DbClient, viewer: Viewer, id: string): Promise<StoryViewer[]> {
  const story = unwrap(await db.from("stories").select("author_id").eq("id", id).maybeSingle());
  if (!story || story.author_id !== viewer.id) throw new AppError("not_found", "Story not found.");
  const rows = unwrap(
    await db.from("story_views").select("viewer_id, viewed_at").eq("story_id", id).order("viewed_at", { ascending: false }).limit(500),
  );
  const profiles = await getSummaries(db, rows.map((r) => r.viewer_id));
  return rows.map((r) => ({ profile: profiles.get(r.viewer_id)!, viewedAt: r.viewed_at }));
}
