import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

describe("ads manager validators", async () => {
  const v = await import("@backend/modules/advertising/validators");

  it("rejects sensitive and unsupported targeting keys", () => {
    for (const bad of [{ age: ["18-24"] }, { gender: ["female"] }, { religion: ["x"] }, { ethnicity: ["x"] }, { languages: ["en"] }]) {
      expect(v.targetingSchema.safeParse(bad).success).toBe(false);
    }
    const ok = v.targetingSchema.parse({ cities: ["Monaco"], industries: ["Finance"] });
    expect(v.compactTargeting(ok)).toEqual({ cities: ["Monaco"], industries: ["Finance"] });
  });

  it("enforces creative format rules", () => {
    const base = { accountId: ACCOUNT, name: "Hero", headline: "Summer", destinationUrl: "https://example.test" };
    const img = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `${ACCOUNT}/img-${i}.jpg`, kind: "image" as const, width: 1200, height: 628 }));
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "single_image", media: img(1) }).success).toBe(true);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "single_image", media: [] }).success).toBe(false);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "carousel", media: img(1) }).success).toBe(false);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "carousel", media: img(3) }).success).toBe(true);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "sponsored_post", media: [] }).success).toBe(false);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "single_image", media: img(1), destinationUrl: "http://insecure.test" }).success).toBe(false);
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "single_image", media: img(1), urlParams: "utm_source=elvora&bad param" }).success).toBe(false);
    const tiny = [{ path: `${ACCOUNT}/a.jpg`, kind: "image" as const, width: 100, height: 100 }];
    expect(v.creativeCreateSchema.safeParse({ ...base, format: "single_image", media: tiny }).success).toBe(false);
  });

  it("validates media uploads by type, size and duration", () => {
    const ok = { accountId: ACCOUNT, fileName: "a.jpg", mimeType: "image/jpeg", size: 1000, width: 1080, height: 1080 };
    expect(v.mediaUploadSchema.safeParse(ok).success).toBe(true);
    expect(v.mediaUploadSchema.safeParse({ ...ok, mimeType: "image/svg+xml" }).success).toBe(false);
    expect(v.mediaUploadSchema.safeParse({ ...ok, size: 11 * 1024 * 1024 }).success).toBe(false);
    expect(v.mediaUploadSchema.safeParse({ ...ok, mimeType: "video/mp4", fileName: "a.mp4", durationS: 300 }).success).toBe(false);
  });

  it("requires the right budget and bid fields", () => {
    const c = { accountId: ACCOUNT, name: "Launch", objective: "reach", startsOn: "2026-12-01", endsOn: "2026-12-31" };
    expect(v.campaignCreateSchema.safeParse({ ...c, budgetType: "daily" }).success).toBe(false);
    expect(v.campaignCreateSchema.safeParse({ ...c, budgetType: "daily", dailyBudget: 50 }).success).toBe(true);
    expect(v.campaignCreateSchema.safeParse({ ...c, budgetType: "lifetime", totalBudget: 500 }).success).toBe(true);
    expect(v.campaignCreateSchema.safeParse({ ...c, budgetType: "daily", dailyBudget: 50, endsOn: "2026-11-01" }).success).toBe(false);
    const s = { campaignId: ACCOUNT, name: "Founders", placements: ["feed"] };
    expect(v.adSetCreateSchema.safeParse({ ...s, bidStrategy: "cpc_cap" }).success).toBe(false);
    expect(v.adSetCreateSchema.safeParse({ ...s, bidStrategy: "cpc_cap", bidAmount: 1.5 }).success).toBe(true);
    expect(v.adSetCreateSchema.safeParse({ ...s, placements: [] }).success).toBe(false);
  });

  it("requires a reason to reject", () => {
    expect(v.reviewDecisionSchema.safeParse({ decision: "rejected" }).success).toBe(false);
    expect(v.reviewDecisionSchema.safeParse({ decision: "rejected", reasons: ["misleading_claims"] }).success).toBe(true);
  });
});

describe("ads manager CSV export", async () => {
  const { metricsToCsv } = await import("@backend/modules/advertising/services/analytics");

  it("quotes values and neutralises spreadsheet formulas", () => {
    const row = {
      key: "c1",
      label: '=HYPERLINK("x"), "Summer"',
      impressions: 1000,
      reach: 800,
      frequency: 1.25,
      clicks: 10,
      ctr: 0.01,
      spendMinor: 2000,
      cpcMinor: 200,
      cpmMinor: 2000,
      conversions: 2,
      conversionRate: 0.2,
      cpaMinor: 1000,
      conversionValueMinor: 6000,
      roas: 3,
    };
    const csv = metricsToCsv({ currency: "USD", rows: [row], totals: row, previous: null }, "Campaign");
    const [header, line] = csv.trimEnd().split("\r\n");
    expect(header).toBe("Campaign,Impressions,Reach,Frequency,Clicks,CTR,Spend (USD),CPC,CPM,Conversions,CVR,CPA,ROAS");
    expect(line).toBe(`"'=HYPERLINK(""x""), ""Summer""",1000,800,1.25,10,1.00%,20.00,2.00,20.00,2,20.00%,10.00,3.00`);
  });
});
