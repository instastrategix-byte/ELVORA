import type { VerificationKind } from "@backend/modules/auth/permissions";

export type CandidateRow = {
  id: string;
  handle: string;
  display_name: string;
  headline: string | null;
  location: string | null;
  avatar_path: string | null;
  verified_kinds: VerificationKind[];
  industry: string | null;
  company: string | null;
  interests: string[];
};

export type RankingContext = { industry: string | null; location: string | null; company: string | null; interests: string[] };

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** First comma-separated part of a location ("Dubai, UAE" → "dubai"). */
const city = (v: string | null | undefined) => norm(v).split(",")[0]?.trim() ?? "";

/**
 * Pure, deterministic ranking used by suggestMembers. Each signal also yields the human
 * reason shown on the card, so members can see *why* someone is suggested.
 */
export function rankSuggestions(me: RankingContext, candidates: CandidateRow[], limit: number): { row: CandidateRow; reason: string }[] {
  const myInterests = new Set(me.interests.map(norm));
  const scored = candidates.map((row, index) => {
    const reasons: [number, string][] = [];
    if (me.company && norm(row.company) === norm(me.company)) reasons.push([4, `Also at ${row.company}`]);
    if (me.industry && norm(row.industry) === norm(me.industry)) reasons.push([3, `Also in ${row.industry}`]);
    if (city(me.location) && city(row.location) === city(me.location)) reasons.push([2, `Also based in ${row.location?.split(",")[0]?.trim()}`]);
    const shared = row.interests.filter((i) => myInterests.has(norm(i)));
    if (shared.length > 0) {
      reasons.push([Math.min(shared.length, 3), shared.length === 1 ? `Shares your interest in ${shared[0]}` : `${shared.length} shared interests`]);
    }
    if (row.verified_kinds.length > 0) reasons.push([1.5, "Verified member"]);
    const score = reasons.reduce((s, [w]) => s + w, 0);
    const best = reasons.sort((a, b) => b[0] - a[0])[0]?.[1] ?? "New to ELVORA";
    // Index breaks ties in favour of newer members (the pool is ordered newest first).
    return { row, reason: best, score, index };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ row, reason }) => ({ row, reason }));
}
