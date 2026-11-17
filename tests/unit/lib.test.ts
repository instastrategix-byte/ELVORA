import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "@/lib/api-client";
import { formatMoney, toMinorUnits } from "@/lib/format";
import { decodeCursor, encodeCursor, toPage } from "@/lib/pagination";
import { isProtectedPath, safeNextPath } from "@/lib/routes";
import { deriveRoles, hasFeature, isStaff, type Viewer } from "@backend/modules/auth/permissions";
import { campaignSchema } from "@backend/modules/ads/schemas";
import { signUpSchema } from "@backend/modules/auth/schemas";
import { createPostSchema } from "@backend/modules/feed/schemas";
import { toAppError } from "@backend/http/db-errors";
import { rateLimit, resetRateLimits } from "@backend/http/rate-limit";
import { redact } from "@backend/core/logger";

afterEach(() => vi.unstubAllGlobals());

describe("routing safety", () => {
  it("only allows same-origin relative redirects", () => {
    expect(safeNextPath("/feed?x=1")).toBe("/feed?x=1");
    expect(safeNextPath("//evil.example")).toBe("/home");
    expect(safeNextPath("https://evil.example")).toBe("/home");
    expect(safeNextPath("/\\evil.example")).toBe("/home");
    expect(safeNextPath(undefined, "/onboarding")).toBe("/onboarding");
  });

  it("marks app areas as protected and public pages as open", () => {
    expect(isProtectedPath("/messages/abc")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
    expect(isProtectedPath("/luxury")).toBe(false);
    expect(isProtectedPath("/members/isabella")).toBe(false);
  });
});

describe("pagination cursors", () => {
  it("round-trips and rejects tampered cursors", () => {
    const c = { t: "2026-10-26T10:00:00.000+00:00", id: "11111111-1111-4111-8111-111111111111" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ t: "x", id: "1;drop" })).toString("base64url"))).toBeNull();
  });

  it("derives the next cursor from limit+1 rows", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `0000000${n}-0000-4000-8000-000000000000`, t: `2026-10-0${n}T00:00:00Z` }));
    const page = toPage(rows, 2, (r) => ({ t: r.t, id: r.id }));
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(toPage(rows.slice(0, 2), 2, (r) => ({ t: r.t, id: r.id })).nextCursor).toBeNull();
  });
});

describe("money", () => {
  it("formats minor units", () => {
    expect(formatMoney(450000, "EUR")).toBe("€4,500");
    expect(formatMoney(1999, "USD")).toBe("$19.99");
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
  });
});

describe("permissions", () => {
  const base: Viewer = {
    id: "u",
    email: null,
    handle: "u",
    displayName: "U",
    avatarPath: null,
    accountStatus: "active",
    onboarded: true,
    features: ["feed.post"],
    staffRole: null,
    verifiedKinds: [],
    hasApprovedBusiness: false,
  };

  it("never treats payment as verification or staff", () => {
    const premium = { ...base, features: [...base.features, "luxury.inquire" as const] };
    expect(deriveRoles(premium)).toEqual(["standard_member", "premium_member"]);
    expect(isStaff(premium)).toBe(false);
  });

  it("suspended accounts hold no features", () => {
    expect(hasFeature({ ...base, accountStatus: "suspended" }, "feed.post")).toBe(false);
  });

  it("ranks staff roles", () => {
    expect(isStaff({ ...base, staffRole: "moderator" }, "support")).toBe(true);
    expect(isStaff({ ...base, staffRole: "support" }, "moderator")).toBe(false);
    expect(deriveRoles(null)).toEqual(["guest"]);
  });
});

describe("validation", () => {
  it("requires post content or media", () => {
    expect(createPostSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(createPostSchema.safeParse({ body: "", attachments: [{ path: "u/x.jpg", type: "image" }] }).success).toBe(true);
  });

  it("enforces password strength and terms acceptance at sign-up", () => {
    const ok = { displayName: "A", email: "a@example.test", password: "Strongpass1", acceptTerms: "on" };
    expect(signUpSchema.safeParse(ok).success).toBe(true);
    expect(signUpSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...ok, acceptTerms: undefined }).success).toBe(false);
  });

  it("checks campaign budgets and schedules", () => {
    const c = {
      name: "Summer",
      objective: "traffic",
      currency: "USD",
      dailyBudget: 50,
      totalBudget: 500,
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
      headline: "Charter the Riviera",
      destinationUrl: "https://example.test",
    };
    expect(campaignSchema.safeParse(c).success).toBe(true);
    expect(campaignSchema.safeParse({ ...c, totalBudget: 10 }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...c, endsOn: "2026-10-01" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...c, destinationUrl: "http://insecure.test" }).success).toBe(false);
  });
});

describe("server helpers", () => {
  it("maps database errors without leaking internals", () => {
    expect(toAppError({ code: "42501", message: "new row violates row-level security policy" }).message).toBe("You are not allowed to do that.");
    expect(toAppError({ code: "P0001", message: "listing not found" })).toMatchObject({ code: "business_rule", message: "Listing not found" });
    expect(toAppError({ code: "XX000", message: "internal stack detail" }).message).not.toContain("stack");
  });

  it("redacts secrets and content from logs", () => {
    expect(redact({ password: "x", nested: { body: "secret msg", ok: 1 }, authorization: "Bearer t" })).toEqual({
      password: "[redacted]",
      nested: { body: "[redacted]", ok: 1 },
      authorization: "[redacted]",
    });
  });

  it("rate limits within a window", () => {
    resetRateLimits();
    const now = 1_000;
    expect(rateLimit("k", 2, 60_000, now).ok).toBe(true);
    expect(rateLimit("k", 2, 60_000, now).ok).toBe(true);
    expect(rateLimit("k", 2, 60_000, now).ok).toBe(false);
    expect(rateLimit("k", 2, 60_000, now + 60_001).ok).toBe(true);
  });
});

describe("api client", () => {
  it("maps 401 to a session-expired message and network failures to offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "unauthenticated", message: "x" } }), { status: 401 })));
    await expect(api("/api/v1/feed")).rejects.toMatchObject({ code: "unauthenticated", message: expect.stringMatching(/expired/) });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api("/api/v1/feed")).rejects.toBeInstanceOf(ApiClientError);
  });
});
