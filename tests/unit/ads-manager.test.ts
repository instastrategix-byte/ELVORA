import { describe, expect, it } from "vitest";
import {
  audienceSizeLabel,
  campaignActionsFor,
  checkAdMedia,
  compactNumber,
  dailySeries,
  eachDay,
  formatPercent,
  majorToMinor,
  minorToMajor,
  niceStep,
  parseTerms,
  periodDelta,
  presetRange,
  roleAtLeast,
} from "@/components/ads-manager/model";
import { assignableRoles } from "@/components/ads-manager/settings-forms";
import { adSetBody, campaignBody, draftFromCampaign, firstIncompleteStep, newDraft, stepIssues } from "@/components/ads-manager/wizard-model";
import type { CampaignDetail } from "@backend/modules/advertising/types";

const TODAY = new Date("2026-11-20T12:00:00Z");

describe("ads manager formatting", () => {
  it("compacts only from 10,000 up", () => {
    expect(compactNumber(1284)).toBe("1,284");
    expect(compactNumber(12_900)).toBe("12.9K");
    expect(compactNumber(4_200_000)).toBe("4.2M");
  });

  it("shows a dash for undefined ratios instead of a fake zero", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0.0123)).toBe("1.23%");
  });

  it("converts money with zero-decimal currencies", () => {
    expect(majorToMinor(12.34, "USD")).toBe(1234);
    expect(minorToMajor(1234, "USD")).toBe(12.34);
    expect(majorToMinor(500, "JPY")).toBe(500);
  });

  it("computes period deltas and refuses to divide by zero", () => {
    expect(periodDelta(150, 100)).toEqual({ ratio: 0.5, direction: "up" });
    expect(periodDelta(50, 100)?.direction).toBe("down");
    expect(periodDelta(100, 0)).toBeNull();
    expect(periodDelta(null, 10)).toBeNull();
  });

  it("picks clean axis steps", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(100)).toBe(25);
    expect(niceStep(870)).toBe(250);
    expect(niceStep(9)).toBe(2.5);
  });

  it("labels audience sizes honestly below the privacy floor", () => {
    expect(audienceSizeLabel(null)).toBe("Fewer than 100 members");
    expect(audienceSizeLabel(23_000)).toBe("About 23K members");
    expect(audienceSizeLabel(undefined)).toBe("—");
  });

  it("parses, trims and de-duplicates targeting terms", () => {
    expect(parseTerms(" London, dubai,\nLondon ,, Mumbai")).toEqual(["London", "dubai", "Mumbai"]);
  });
});

describe("date ranges and series", () => {
  it("builds inclusive UTC ranges ending today", () => {
    expect(presetRange("7d", TODAY)).toEqual({ from: "2026-11-14", to: "2026-11-20" });
    expect(eachDay("2026-11-28", "2026-12-02")).toEqual(["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });

  it("fills days without delivery with zeros", () => {
    const row = { key: "2026-11-15", impressions: 10, clicks: 1, spendMinor: 500, conversions: 0, conversionValueMinor: 0, ctr: 0.1, cpcMinor: 500, cpmMinor: 50000, cpaMinor: null, roas: null, conversionRate: 0 };
    expect(dailySeries([row], "2026-11-14", "2026-11-16", "spendMinor")).toEqual([
      { date: "2026-11-14", value: 0 },
      { date: "2026-11-15", value: 500 },
      { date: "2026-11-16", value: 0 },
    ]);
  });
});

describe("media checks", () => {
  it("mirrors the server limits", () => {
    expect(checkAdMedia({ mimeType: "image/gif", size: 10 })).toMatch(/JPEG/);
    expect(checkAdMedia({ mimeType: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(checkAdMedia({ mimeType: "image/png", size: 1000, width: 300, height: 900 })).toMatch(/400/);
    expect(checkAdMedia({ mimeType: "video/mp4", size: 1000, durationS: 121 })).toMatch(/120 seconds/);
    expect(checkAdMedia({ mimeType: "image/jpeg", size: 1000, width: 1200, height: 628 })).toBeNull();
  });
});

describe("roles and actions", () => {
  it("ranks roles", () => {
    expect(roleAtLeast("admin", "editor")).toBe(true);
    expect(roleAtLeast("analyst", "editor")).toBe(false);
    expect(roleAtLeast(null, "analyst")).toBe(false);
  });

  it("offers no write actions to analysts", () => {
    expect(campaignActionsFor({ status: "active", archivedAt: null, suspendedAt: null, structure: "managed" }, "analyst")).toEqual([]);
  });

  it("offers state-appropriate campaign actions", () => {
    const base = { archivedAt: null, suspendedAt: null, structure: "managed" as const };
    expect(campaignActionsFor({ ...base, status: "draft" }, "editor")).toEqual(["submit", "duplicate", "archive"]);
    expect(campaignActionsFor({ ...base, status: "active" }, "editor")).toEqual(["pause", "duplicate", "archive"]);
    expect(campaignActionsFor({ ...base, status: "pending_review" }, "editor")).toEqual(["duplicate"]);
    expect(campaignActionsFor({ ...base, status: "paused", suspendedAt: "2026-01-01" }, "owner")).not.toContain("resume");
    expect(campaignActionsFor({ ...base, status: "paused", archivedAt: "2026-01-01" }, "owner")).toEqual(["unarchive", "duplicate"]);
    expect(campaignActionsFor({ ...base, status: "draft", structure: "legacy" }, "owner")).not.toContain("submit");
  });

  it("limits who can grant which role", () => {
    expect(assignableRoles("owner")).toEqual(["admin", "editor", "analyst"]);
    expect(assignableRoles("admin")).toEqual(["editor", "analyst"]);
    expect(assignableRoles("editor")).toEqual([]);
  });
});

describe("campaign wizard", () => {
  it("requires a name before leaving step 1, but not a budget", () => {
    const d = newDraft(TODAY);
    expect(Object.keys(stepIssues("objective", d))).toEqual(["name"]);
    expect(stepIssues("objective", { ...d, name: "Spring villas" })).toEqual({});
  });

  it("validates the budget step with the API schema", () => {
    const d = { ...newDraft(TODAY), name: "Spring villas" };
    expect(stepIssues("budget", d).dailyBudget).toBeDefined();
    expect(stepIssues("budget", { ...d, dailyBudget: "50" })).toEqual({});
    expect(stepIssues("budget", { ...d, dailyBudget: "50", endsOn: "2026-01-01" }).endsOn).toBeDefined();
    expect(stepIssues("budget", { ...d, budgetType: "lifetime" }).totalBudget).toBeDefined();
  });

  it("builds bodies the API accepts", () => {
    const d = { ...newDraft(TODAY), name: "Spring villas", dailyBudget: "50", totalBudget: "" };
    expect(campaignBody(d)).toMatchObject({ dailyBudget: 50, totalBudget: null, startsOn: "2026-11-21", endsOn: "2026-12-20" });
    expect(adSetBody(d).targeting.languages).toEqual([]);
  });

  it("needs a bid for capped strategies and at least one placement", () => {
    const d = { ...newDraft(TODAY), name: "x".repeat(5) };
    expect(stepIssues("bidding", { ...d, bidStrategy: "cpc_cap" }).bidAmount).toBeDefined();
    expect(stepIssues("bidding", { ...d, bidStrategy: "cpc_cap", bidAmount: "1.5" })).toEqual({});
    expect(stepIssues("placements", { ...d, placements: [] }).placements).toBeDefined();
  });

  it("validates creatives per format", () => {
    const d = newDraft(TODAY);
    const issues = stepIssues("creative", { ...d, creative: { ...d.creative, name: "Hero", headline: "Stay at the villa", destinationUrl: "https://villa.example" } });
    expect(issues.media).toBeDefined(); // single image needs exactly one image
    expect(stepIssues("creative", { ...d, creativeMode: "existing", creativeId: null }).creativeId).toBeDefined();
    expect(
      stepIssues("creative", {
        ...d,
        creative: { ...d.creative, name: "Hero", headline: "Stay", destinationUrl: "http://insecure.example", media: [{ path: `${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}/x.jpg`, kind: "image" }] },
      }).destinationUrl,
    ).toBeDefined();
  });

  it("resumes a saved draft at the first unfinished step", () => {
    const campaign: CampaignDetail = {
      id: "c1",
      accountId: "a1",
      name: "Spring villas",
      objective: "traffic",
      status: "draft",
      structure: "managed",
      currency: "EUR",
      budgetType: "daily",
      dailyBudgetMinor: 5000,
      totalBudgetMinor: 150000,
      spendCapMinor: null,
      specialCategory: "none",
      startsOn: "2026-12-01",
      endsOn: "2026-12-30",
      cpmMinor: null,
      cpcMinor: null,
      reviewNote: null,
      archivedAt: null,
      suspendedAt: null,
      submittedAt: null,
      createdAt: "",
      updatedAt: "",
      adSets: [],
      creatives: [],
    };
    const d = draftFromCampaign(campaign);
    expect(d).toMatchObject({ campaignId: "c1", dailyBudget: "50", totalBudget: "1500", objective: "traffic" });
    expect(firstIncompleteStep(d)).toBe(2);
    expect(firstIncompleteStep({ ...d, adSetId: "s1" })).toBe(5);
    expect(firstIncompleteStep({ ...d, adSetId: "s1", adId: "ad1" })).toBe(6);
  });
});
