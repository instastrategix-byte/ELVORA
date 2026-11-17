import { describe, expect, it } from "vitest";
import { profileCompleteness, type CompletenessInput } from "@backend/modules/profiles/completeness";

const empty: CompletenessInput = {
  handle: "member_0123456789ab",
  avatar_path: null,
  cover_path: null,
  headline: null,
  bio: null,
  job_title: null,
  company: null,
  location: null,
  member_type: null,
  skills: [],
  interests: [],
  open_to: [],
  verified_kinds: [],
  experienceCount: 0,
};

describe("profileCompleteness", () => {
  it("is 0% for a brand-new account and lists every step", () => {
    const result = profileCompleteness(empty);
    expect(result.percent).toBe(0);
    expect(result.missing.map((m) => m.key)).toContain("avatar");
    expect(result.missing.find((m) => m.key === "verified")?.href).toBe("/account/verification");
  });

  it("is 100% when everything is filled in", () => {
    const result = profileCompleteness({
      handle: "elena",
      avatar_path: "a/avatar.jpg",
      cover_path: "a/cover.jpg",
      headline: "Founder, Maison Lumen",
      bio: "Building hotels.",
      job_title: "CEO",
      company: "Maison Lumen",
      location: "Lisbon",
      member_type: "founder",
      skills: ["Hospitality", "Strategy", "Fundraising"],
      interests: ["Sailing"],
      open_to: ["investing"],
      verified_kinds: ["identity"],
      experienceCount: 2,
    });
    expect(result).toEqual({ percent: 100, missing: [] });
  });

  it("ignores whitespace-only fields and needs both title and company", () => {
    const result = profileCompleteness({ ...empty, headline: "   ", job_title: "CEO" });
    const keys = result.missing.map((m) => m.key);
    expect(keys).toContain("headline");
    expect(keys).toContain("role");
  });
});
