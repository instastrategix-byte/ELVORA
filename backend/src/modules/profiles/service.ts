import "server-only";
import { AppError } from "@/lib/errors";
import { publicMediaUrl } from "@/lib/media";
import { decodeCursor, olderThanFilter, toPage, type Page } from "@/lib/pagination";
import type { TablesUpdate } from "@backend/db/database.types";
import type { DbClient } from "@backend/db/server";
import type { Viewer } from "@backend/modules/auth/permissions";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import { assertOwnedPath } from "@backend/modules/storage/service";
import type { MemberSearch } from "./schemas";
import type { experienceSchema, experienceUpdateSchema, profileUpdateSchema, privacyUpdateSchema } from "./schemas";
import type { z } from "zod";
import {
  OPEN_TO,
  PRIVATE_MEMBER,
  type Experience,
  type OpenTo,
  type ProfileDetail,
  type ProfileSummary,
  type Relationship,
} from "./types";

const EXPERIENCE_COLUMNS = "id, title, company, location, starts_on, ends_on, description";

type ExperienceRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  starts_on: string;
  ends_on: string | null;
  description: string | null;
};

function toExperience(r: ExperienceRow): Experience {
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    description: r.description,
  };
}

const KNOWN_OPEN_TO = new Set<string>(OPEN_TO);
const toOpenTo = (values: string[]): OpenTo[] => values.filter((v): v is OpenTo => KNOWN_OPEN_TO.has(v));

/** Experience visible to the viewer (RLS mirrors the profile's own visibility); current roles first. */
export async function listExperiences(db: DbClient, profileId: string): Promise<Experience[]> {
  const rows = unwrap(
    await db
      .from("profile_experiences")
      .select(EXPERIENCE_COLUMNS)
      .eq("profile_id", profileId)
      .order("ends_on", { ascending: false, nullsFirst: true })
      .order("starts_on", { ascending: false })
      .limit(20),
  );
  return rows.map(toExperience);
}

const SUMMARY_COLUMNS = "id, handle, display_name, headline, location, avatar_path, verified_kinds, created_at";

type SummaryRow = {
  id: string;
  handle: string;
  display_name: string;
  headline: string | null;
  location: string | null;
  avatar_path: string | null;
  verified_kinds: ProfileSummary["verifiedKinds"];
};

export function toSummary(row: SummaryRow): ProfileSummary {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    headline: row.headline,
    location: row.location,
    avatarUrl: publicMediaUrl("profile-media", row.avatar_path),
    verifiedKinds: row.verified_kinds,
  };
}

/** Loads profile summaries visible to the viewer (RLS). Invisible profiles become "Private member". */
export async function getSummaries(db: DbClient, ids: string[]): Promise<Map<string, ProfileSummary>> {
  const unique = [...new Set(ids)].slice(0, 200);
  const map = new Map<string, ProfileSummary>();
  if (unique.length === 0) return map;
  const rows = unwrap(await db.from("profiles").select(SUMMARY_COLUMNS).in("id", unique));
  for (const row of rows) map.set(row.id, toSummary(row));
  for (const id of unique) if (!map.has(id)) map.set(id, { id, ...PRIVATE_MEMBER });
  return map;
}

export async function getProfileByHandle(db: DbClient, handle: string): Promise<ProfileDetail | null> {
  const row = unwrap(
    await db
      .from("profiles")
      .select(
        "id, handle, display_name, headline, location, avatar_path, cover_path, verified_kinds, bio, job_title, company, industry, website, interests, profile_visibility, created_at, member_type, skills, open_to, achievements, linkedin_url, x_url, instagram_url",
      )
      .eq("handle", handle.toLowerCase())
      .maybeSingle(),
  );
  if (!row) return null;
  const [businessRes, experiences] = await Promise.all([
    db.from("businesses").select("id").eq("owner_id", row.id).eq("status", "approved").limit(1),
    listExperiences(db, row.id),
  ]);
  const business = unwrap(businessRes);
  return {
    ...toSummary(row),
    bio: row.bio,
    jobTitle: row.job_title,
    company: row.company,
    industry: row.industry,
    website: row.website,
    interests: row.interests,
    coverUrl: publicMediaUrl("profile-media", row.cover_path),
    profileVisibility: row.profile_visibility,
    memberSince: row.created_at,
    hasApprovedBusiness: business.length > 0,
    memberType: row.member_type,
    skills: row.skills,
    openTo: toOpenTo(row.open_to),
    achievements: row.achievements,
    socialLinks: { website: row.website, linkedin: row.linkedin_url, x: row.x_url, instagram: row.instagram_url },
    experiences,
  };
}

export async function getOwnProfile(db: DbClient, viewer: Viewer) {
  return unwrap(await db.from("profiles").select("*").eq("id", viewer.id).single());
}

export type OwnProfileDetail = Awaited<ReturnType<typeof getOwnProfile>> & { experienceCount: number };

/** The signed-in member's full profile row plus how many experience entries they have listed. */
export async function getOwnProfileDetail(db: DbClient, viewer: Viewer): Promise<OwnProfileDetail> {
  const [profile, countRes] = await Promise.all([
    getOwnProfile(db, viewer),
    db.from("profile_experiences").select("id", { count: "exact", head: true }).eq("profile_id", viewer.id),
  ]);
  throwIfError(countRes.error);
  return { ...profile, experienceCount: countRes.count ?? 0 };
}

export async function getRelationship(db: DbClient, viewer: Viewer, otherId: string): Promise<Relationship> {
  if (viewer.id === otherId) return { connection: null, following: false, blocked: false, canMessage: false };
  const [conn, follow, block, canMessage] = await Promise.all([
    db
      .from("connections")
      .select("id, status, requester_id")
      .or(`and(requester_id.eq.${viewer.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${viewer.id})`)
      .in("status", ["pending", "accepted"])
      .maybeSingle(),
    db.from("follows").select("followee_id").eq("follower_id", viewer.id).eq("followee_id", otherId).maybeSingle(),
    db.from("user_blocks").select("blocked_id").eq("blocker_id", viewer.id).eq("blocked_id", otherId).maybeSingle(),
    db.rpc("can_message", { p_other: otherId }),
  ]);
  const c = unwrap(conn);
  return {
    connection: c
      ? {
          id: c.id,
          status: c.status === "accepted" ? "accepted" : "pending",
          direction: c.requester_id === viewer.id ? "outgoing" : "incoming",
        }
      : null,
    following: Boolean(unwrap(follow)),
    blocked: Boolean(unwrap(block)),
    canMessage: Boolean(unwrap(canMessage)),
  };
}

export async function updateProfile(db: DbClient, viewer: Viewer, input: z.infer<typeof profileUpdateSchema>) {
  if (input.avatarPath) assertOwnedPath(viewer, input.avatarPath);
  if (input.coverPath) assertOwnedPath(viewer, input.coverPath);
  // Only member-editable columns; trusted columns are also blocked by column-level grants.
  const patch: TablesUpdate<"profiles"> = {
    handle: input.handle,
    display_name: input.displayName,
    headline: input.headline,
    bio: input.bio,
    job_title: input.jobTitle,
    company: input.company,
    industry: input.industry,
    location: input.location,
    website: input.website,
    interests: input.interests,
    member_type: input.memberType,
    skills: input.skills,
    open_to: input.openTo,
    achievements: input.achievements,
    linkedin_url: input.linkedinUrl,
    x_url: input.xUrl,
    instagram_url: input.instagramUrl,
    avatar_path: input.avatarPath,
    cover_path: input.coverPath,
  };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete patch[key];
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("profiles").update(patch).eq("id", viewer.id);
  if (error?.code === "23505") throw new AppError("conflict", "That handle is already taken.", { handle: ["That handle is already taken"] });
  throwIfError(error);
}

export async function addExperience(db: DbClient, viewer: Viewer, input: z.infer<typeof experienceSchema>): Promise<Experience> {
  const { data, error } = await db
    .from("profile_experiences")
    .insert({
      profile_id: viewer.id,
      title: input.title,
      company: input.company,
      location: input.location ?? null,
      starts_on: input.startsOn,
      ends_on: input.endsOn ?? null,
      description: input.description ?? null,
    })
    .select(EXPERIENCE_COLUMNS)
    .single();
  if (error?.code === "P0001") throw new AppError("conflict", "You can list up to 20 roles.");
  throwIfError(error);
  return toExperience(data!);
}

export async function updateExperience(
  db: DbClient,
  viewer: Viewer,
  id: string,
  input: z.infer<typeof experienceUpdateSchema>,
): Promise<Experience> {
  const patch: TablesUpdate<"profile_experiences"> = {
    title: input.title,
    company: input.company,
    location: input.location,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    description: input.description,
  };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete patch[key];
  const row = unwrap(
    await db.from("profile_experiences").update(patch).eq("id", id).eq("profile_id", viewer.id).select(EXPERIENCE_COLUMNS).maybeSingle(),
  );
  if (!row) throw new AppError("not_found", "That role no longer exists.");
  return toExperience(row);
}

export async function deleteExperience(db: DbClient, viewer: Viewer, id: string) {
  const rows = unwrap(await db.from("profile_experiences").delete().eq("id", id).eq("profile_id", viewer.id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "That role no longer exists.");
}

export async function updatePrivacy(db: DbClient, viewer: Viewer, input: z.infer<typeof privacyUpdateSchema>) {
  unwrap(
    await db
      .from("profiles")
      .update({
        profile_visibility: input.profileVisibility,
        discoverable: input.discoverable,
        messaging_policy: input.messagingPolicy,
      })
      .eq("id", viewer.id),
  );
}

export async function completeOnboarding(db: DbClient) {
  unwrap(await db.rpc("complete_onboarding"));
}

const SEARCH_PAGE = 24;

/** Member discovery. Bounded, keyset-paginated, and filtered by RLS + the `discoverable` flag. */
export async function searchMembers(db: DbClient, viewer: Viewer | null, search: MemberSearch): Promise<Page<ProfileSummary>> {
  let query = db
    .from("profiles")
    .select(SUMMARY_COLUMNS)
    .eq("discoverable", true)
    .eq("account_status", "active")
    .not("onboarding_completed_at", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SEARCH_PAGE + 1);
  if (viewer) query = query.neq("id", viewer.id);
  const q = search.q?.replace(/[%,()]/g, " ").trim();
  if (q) query = query.or(`display_name.ilike.%${q}%,headline.ilike.%${q}%,company.ilike.%${q}%,handle.ilike.%${q}%`);
  const loc = search.location?.replace(/[%,()]/g, " ").trim();
  if (loc) query = query.ilike("location", `%${loc}%`);
  const ind = search.industry?.replace(/[%,()]/g, " ").trim();
  if (ind) query = query.ilike("industry", `%${ind}%`);
  if (search.verified === "verified") query = query.filter("verified_kinds", "neq", "{}");
  if (search.memberType) query = query.eq("member_type", search.memberType);
  if (search.openTo) query = query.contains("open_to", [search.openTo]);
  // Interests are free text as members typed them; match the common casings of the term
  // (exact, lower, Title) rather than scanning every array element case-insensitively.
  const interest = search.interest?.trim();
  if (interest) {
    const lower = interest.toLowerCase();
    const title = lower.replace(/\b\w/g, (c) => c.toUpperCase());
    query = query.overlaps("interests", [...new Set([interest, lower, title])]);
  }
  const cursor = decodeCursor(search.cursor);
  if (cursor) query = query.or(olderThanFilter(cursor));
  const rows = unwrap(await query);
  const page = toPage(rows, SEARCH_PAGE, (r) => ({ t: r.created_at, id: r.id }));
  return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
}
