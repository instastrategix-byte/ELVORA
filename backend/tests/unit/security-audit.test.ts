import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/routes";
import { isSafeDestination } from "@/lib/safe-url";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";
import { assertSameOrigin, clientIp } from "@backend/http/route";

function req(headers: Record<string, string>, method = "POST") {
  return new Request("https://elvora.app/api/v1/x", { method, headers });
}

describe("safeNextPath", () => {
  it("keeps internal paths", () => {
    expect(safeNextPath("/home")).toBe("/home");
    expect(safeNextPath("/members/x?tab=reels#top")).toBe("/members/x?tab=reels#top");
  });
  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/a\\b", "https://evil.com", "javascript:alert(1)", "", null])(
    "rejects %j",
    (bad) => {
      expect(safeNextPath(bad as string | null)).toBe("/home");
    },
  );
});

describe("assertSameOrigin", () => {
  it("accepts same-origin and header-less server calls", () => {
    expect(() => assertSameOrigin(req({ origin: "https://elvora.app", host: "elvora.app" }))).not.toThrow();
    expect(() => assertSameOrigin(req({ host: "elvora.app" }))).not.toThrow();
  });
  it("rejects other origins, null origins and cross-site fetch metadata", () => {
    expect(() => assertSameOrigin(req({ origin: "https://evil.example", host: "elvora.app" }))).toThrow();
    expect(() => assertSameOrigin(req({ origin: "null", host: "elvora.app" }))).toThrow();
    expect(() => assertSameOrigin(req({ host: "elvora.app", "sec-fetch-site": "cross-site" }))).toThrow();
  });
});

describe("clientIp", () => {
  it("prefers the platform-set address over a client-supplied X-Forwarded-For", () => {
    expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "x-forwarded-for": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("isSafeDestination", () => {
  it("allows only credential-free https URLs", () => {
    expect(isSafeDestination("https://brand.example/landing?utm=1")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://brand.example", "https://bank.com@evil.example", "//evil.example", "/local"]) {
      expect(isSafeDestination(bad)).toBe(false);
    }
  });
});

describe("security headers", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co", dev: false });
  it("locks scripts, framing, plugins and forms to this origin", () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });
  it("allows the project's Supabase REST, storage media and realtime", () => {
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).toContain("media-src 'self' blob: https://abc.supabase.co");
  });
  it("permits the in-app camera but nothing else sensitive", () => {
    const pp = securityHeaders({ dev: false }).find((h) => h.key === "Permissions-Policy")!.value;
    expect(pp).toContain("camera=(self)");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
  });
  it("allows eval and dev websockets only in development", () => {
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });
});
