import "server-only";
import { AppError } from "@/lib/errors";
import { decodeCursor, olderThanFilter, toPage, type Page } from "@/lib/pagination";
import type { DbClient } from "@backend/db/server";
import { hasFeature, type Viewer } from "@backend/modules/auth/permissions";
import { throwIfError, unwrap } from "@backend/http/db-errors";
import { getSummaries } from "@backend/modules/profiles/service";
import type { OpportunityInput, OpportunityListQuery } from "./schemas";
import type { InterestStatus, InterestView, OpportunityCard, OpportunityDetail } from "./types";

/*
 * Opportunities board. Visibility, privacy of interest, posting rights, the 10-open cap and the
 * interest rules are enforced in SQL (migration 20261119000100); this module shapes data.
 */

const PAGE = 20;
const COLUMNS =
  "id, author_id, kind, title, summary, details, industry, location, remote, visibility, amount_min_minor, amount_max_minor, currency, status, interest_count, expires_at, created_at";

type Row = {
  id: string;
  author_id: string;
  kind: OpportunityCard["kind"];
  title: string;
  summary: string | null;
  details: string | null;
  industry: string | null;
  location: string | null;
  remote: boolean;
  visibility: "members" | "connections";
  amount_min_minor: number | null;
  amount_max_minor: number | null;
  currency: string | null;
  status: "open" | "closed";
  interest_count: number;
  expires_at: string;
  created_at: string;
};

const clean = (v: string | undefined) => v?.replace(/[%,()*\\]/g, " ").trim() || undefined;

async function toCards(db: DbClient, viewer: Viewer, rows: Row[]): Promise<(OpportunityCard & { details: string | null; myNote: string | null })[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [authors, mine] = await Promise.all([
    getSummaries(db, rows.map((r) => r.author_id)),
    db.from("opportunity_interests").select("opportunity_id, status, note").eq("user_id", viewer.id).in("opportunity_id", ids),
  ]);
  const myInterest = new Map(unwrap(mine).map((i) => [i.opportunity_id, i]));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary,
    details: r.details,
    industry: r.industry,
    location: r.location,
    remote: r.remote,
    visibility: r.visibility,
    amountMinMinor: r.amount_min_minor,
    amountMaxMinor: r.amount_max_minor,
    currency: r.currency,
    status: r.status,
    expired: new Date(r.expires_at).getTime() <= now,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    author: authors.get(r.author_id)!,
    isAuthor: r.author_id === viewer.id,
    interestCount: r.author_id === viewer.id ? r.interest_count : 0,
    myInterest: (myInterest.get(r.id)?.status as InterestStatus | undefined) ?? null,
    myNote: myInterest.get(r.id)?.note ?? null,
  }));
}

/** Browse (open & live), my posts, or opportunities I've responded to. Keyset-paginated. */
export async function listOpportunities(db: DbClient, viewer: Viewer, query: OpportunityListQuery): Promise<Page<OpportunityCard>> {
  let q = db
    .from("opportunities")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE + 1);

  if (query.tab === "mine") {
    q = q.eq("author_id", viewer.id);
  } else if (query.tab === "interested") {
    const ids = unwrap(
      await db.from("opportunity_interests").select("opportunity_id").eq("user_id", viewer.id).neq("status", "withdrawn").limit(500),
    ).map((r) => r.opportunity_id);
    if (ids.length === 0) return { items: [], nextCursor: null };
    q = q.in("id", ids);
  } else {
    q = q.eq("status", "open").gt("expires_at", new Date().toISOString());
  }
  if (query.kind) q = q.eq("kind", query.kind);
  const industry = clean(query.industry);
  if (industry) q = q.ilike("industry", `%${industry}%`);
  const text = clean(query.q);
  if (text) q = q.or(`title.ilike.%${text}%,summary.ilike.%${text}%,industry.ilike.%${text}%`);
  const cursor = decodeCursor(query.cursor);
  if (cursor) q = q.or(olderThanFilter(cursor));

  const rows = unwrap(await q) as Row[];
  const page = toPage(rows, PAGE, (r) => ({ t: r.created_at, id: r.id }));
  return { items: await toCards(db, viewer, page.items), nextCursor: page.nextCursor };
}

export async function getOpportunity(db: DbClient, viewer: Viewer, id: string): Promise<OpportunityDetail | null> {
  const row = unwrap(await db.from("opportunities").select(COLUMNS).eq("id", id).maybeSingle()) as Row | null;
  if (!row) return null;
  const [card] = await toCards(db, viewer, [row]);
  return card ?? null;
}

function fields(input: OpportunityInput) {
  const hasAmount = input.amountMinMinor != null || input.amountMaxMinor != null;
  return {
    kind: input.kind,
    title: input.title,
    summary: input.summary ?? null,
    details: input.details ?? null,
    industry: input.industry ?? null,
    location: input.location ?? null,
    remote: input.remote,
    visibility: input.visibility,
    amount_min_minor: hasAmount ? (input.amountMinMinor ?? null) : null,
    amount_max_minor: hasAmount ? (input.amountMaxMinor ?? null) : null,
    currency: hasAmount ? (input.currency ?? null) : null,
  };
}

export async function createOpportunity(db: DbClient, viewer: Viewer, input: OpportunityInput): Promise<{ id: string }> {
  const expires = new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString();
  const row = unwrap(
    await db
      .from("opportunities")
      .insert({ author_id: viewer.id, ...fields(input), expires_at: expires })
      .select("id")
      .single(),
  );
  return { id: row.id };
}

export async function updateOpportunity(db: DbClient, viewer: Viewer, id: string, input: OpportunityInput): Promise<{ id: string }> {
  const existing = unwrap(await db.from("opportunities").select("author_id, created_at").eq("id", id).maybeSingle());
  if (!existing || existing.author_id !== viewer.id) throw new AppError("not_found", "Opportunity not found.");
  // Expiry is measured from the original posting date and capped at 180 days by the database.
  const maxExpiry = new Date(existing.created_at).getTime() + 180 * 86_400_000;
  const expires = new Date(Math.min(Date.now() + input.expiresInDays * 86_400_000, maxExpiry - 60_000)).toISOString();
  const rows = unwrap(await db.from("opportunities").update({ ...fields(input), expires_at: expires }).eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Opportunity not found.");
  return { id };
}

export async function setOpportunityStatus(db: DbClient, id: string, status: "open" | "closed") {
  const rows = unwrap(await db.from("opportunities").update({ status }).eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Opportunity not found.");
}

export async function deleteOpportunity(db: DbClient, id: string) {
  const rows = unwrap(await db.from("opportunities").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new AppError("not_found", "Opportunity not found.");
}

/** Express (or renew) interest with an optional private note. */
export async function expressInterest(db: DbClient, viewer: Viewer, id: string, note: string | null | undefined) {
  const existing = unwrap(await db.from("opportunity_interests").select("status").eq("opportunity_id", id).eq("user_id", viewer.id).maybeSingle());
  if (!existing) {
    throwIfError((await db.from("opportunity_interests").insert({ opportunity_id: id, user_id: viewer.id, note: note ?? null })).error);
    return;
  }
  const patch: { note: string | null; status?: InterestStatus } = { note: note ?? null };
  if (existing.status === "withdrawn") patch.status = "pending";
  else if (existing.status !== "pending") throw new AppError("business_rule", "The poster has already responded to your interest.");
  throwIfError((await db.from("opportunity_interests").update(patch).eq("opportunity_id", id).eq("user_id", viewer.id)).error);
}

export async function withdrawInterest(db: DbClient, viewer: Viewer, id: string) {
  const rows = unwrap(
    await db.from("opportunity_interests").update({ status: "withdrawn" }).eq("opportunity_id", id).eq("user_id", viewer.id).select("user_id"),
  );
  if (rows.length === 0) throw new AppError("not_found", "You haven't expressed interest in this opportunity.");
}

const POLICY_REASON: Record<string, string> = {
  nobody: "This member isn't accepting messages.",
  connections: "This member only accepts messages from connections.",
};

/** Interested members (poster only — RLS returns nothing to anyone else). */
export async function listInterests(db: DbClient, viewer: Viewer, id: string): Promise<InterestView[]> {
  const rows = unwrap(
    await db
      .from("opportunity_interests")
      .select("user_id, note, status, created_at")
      .eq("opportunity_id", id)
      .neq("user_id", viewer.id)
      .order("created_at", { ascending: true })
      .limit(200),
  );
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.user_id);
  const canSend = hasFeature(viewer, "messages.send");
  const [people, policies, allowed] = await Promise.all([
    getSummaries(db, userIds),
    db.from("profiles").select("id, messaging_policy").in("id", userIds),
    canSend
      ? Promise.all(userIds.map(async (uid) => [uid, Boolean(unwrap(await db.rpc("can_message", { p_other: uid })))] as const))
      : Promise.resolve([] as (readonly [string, boolean])[]),
  ]);
  const policy = new Map(unwrap(policies).map((p) => [p.id, p.messaging_policy as string]));
  const canMessage = new Map(allowed);
  return rows.map((r) => {
    const ok = canSend && canMessage.get(r.user_id) === true;
    return {
      member: people.get(r.user_id)!,
      note: r.note,
      status: r.status,
      createdAt: r.created_at,
      canMessage: ok,
      messageBlockedReason: ok
        ? null
        : !canSend
          ? "Messaging isn't included in your membership."
          : (POLICY_REASON[policy.get(r.user_id) ?? ""] ?? "Messaging isn't available with this member."),
    };
  });
}

export async function setInterestStatus(db: DbClient, id: string, userId: string, status: "pending" | "shortlisted" | "declined") {
  const rows = unwrap(
    await db.from("opportunity_interests").update({ status }).eq("opportunity_id", id).eq("user_id", userId).select("user_id"),
  );
  if (rows.length === 0) throw new AppError("not_found", "Interest not found.");
}
