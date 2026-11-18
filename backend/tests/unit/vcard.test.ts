import { describe, expect, it } from "vitest";
import type { ProfileDetail } from "@backend/modules/profiles/types";
import { toVCard } from "@backend/modules/profiles/vcard";

const base: ProfileDetail = {
  id: "x",
  handle: "isabella",
  displayName: "Isabella Maria Marchetti",
  headline: "Founder, Atelier; investor",
  location: "Milan, Italy",
  avatarUrl: null,
  verifiedKinds: [],
  bio: null,
  jobTitle: "CEO",
  company: "Atelier Marchetti",
  industry: null,
  website: null,
  interests: [],
  coverUrl: null,
  profileVisibility: "members",
  memberSince: "2026-01-01",
  hasApprovedBusiness: false,
  memberType: "founder",
  skills: [],
  openTo: [],
  achievements: [],
  socialLinks: { website: "https://atelier.example", linkedin: "https://linkedin.com/in/x", x: null, instagram: "http://insecure.example" },
  experiences: [],
};

describe("toVCard", () => {
  it("builds a valid card with escaped values and https links only", () => {
    const card = toVCard(base, "https://elvora.app/members/isabella");
    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(card).toContain("N:Marchetti;Isabella;Maria;;");
    expect(card).toContain("FN:Isabella Maria Marchetti");
    expect(card).toContain("NOTE:Founder\\, Atelier\\; investor");
    expect(card).toContain("URL;TYPE=LINKEDIN:https://linkedin.com/in/x");
    expect(card).not.toContain("insecure.example");
    expect(card).not.toMatch(/EMAIL|TEL/);
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
  });
});
