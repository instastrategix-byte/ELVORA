import { describe, expect, it } from "vitest";
import { rankSuggestions, type CandidateRow } from "@backend/modules/discovery/ranking";

const row = (id: string, over: Partial<CandidateRow> = {}): CandidateRow => ({
  id,
  handle: id,
  display_name: id,
  headline: null,
  location: null,
  avatar_path: null,
  verified_kinds: [],
  industry: null,
  company: null,
  interests: [],
  ...over,
});

const me = { industry: "Finance", location: "Dubai, UAE", company: null, interests: ["Sailing", "Art"] };

describe("rankSuggestions", () => {
  it("prefers shared industry, city and interests and explains why", () => {
    const out = rankSuggestions(
      me,
      [row("stranger"), row("city", { location: "dubai" }), row("industry", { industry: "finance" }), row("art", { interests: ["art", "sailing"] })],
      4,
    );
    expect(out.map((o) => o.row.id)).toEqual(["industry", "city", "art", "stranger"]);
    expect(out[0]!.reason).toBe("Also in finance");
    expect(out[1]!.reason).toBe("Also based in dubai");
    expect(out[2]!.reason).toBe("2 shared interests");
    expect(out[3]!.reason).toBe("New to ELVORA");
  });

  it("keeps newest-first order among equals and respects the limit", () => {
    const out = rankSuggestions(me, [row("a"), row("b"), row("c")], 2);
    expect(out.map((o) => o.row.id)).toEqual(["a", "b"]);
  });

  it("ranks verified members above unverified strangers", () => {
    const out = rankSuggestions(me, [row("plain"), row("verified", { verified_kinds: ["executive"] })], 2);
    expect(out[0]!.row.id).toBe("verified");
    expect(out[0]!.reason).toBe("Verified member");
  });
});
