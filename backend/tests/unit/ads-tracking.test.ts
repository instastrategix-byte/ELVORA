import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  pixelPayloadSchema,
  requestHost,
  sanitizePageUrl,
  serverPayloadSchema,
  signPayload,
  toMinor,
  verifySignature,
} from "@backend/modules/advertising/tracking/ingest";
import { pixelScript } from "@backend/modules/advertising/tracking/pixel";

vi.mock("server-only", () => ({}));

const SECRET = "elvsk_test_secret";
const PIXEL = `elvpx_${"a".repeat(32)}`;

describe("server API signatures", () => {
  const body = JSON.stringify({ event: "lead", event_id: "e1", consent: true });
  const now = 1_800_000_000;

  it("accepts a fresh, correct signature", () => {
    const ts = String(now - 10);
    expect(verifySignature(SECRET, ts, body, signPayload(SECRET, ts, body), now)).toEqual({ ok: true });
  });

  it("rejects tampered bodies, wrong secrets, stale or missing headers", () => {
    const ts = String(now);
    const sig = signPayload(SECRET, ts, body);
    expect(verifySignature(SECRET, ts, `${body} `, sig, now)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifySignature("other", ts, body, sig, now)).toEqual({ ok: false, reason: "mismatch" });
    expect(verifySignature(SECRET, String(now - 301), body, signPayload(SECRET, String(now - 301), body), now)).toEqual({ ok: false, reason: "stale" });
    expect(verifySignature(SECRET, String(now + 301), body, signPayload(SECRET, String(now + 301), body), now)).toEqual({ ok: false, reason: "stale" });
    expect(verifySignature(SECRET, null, body, sig, now)).toEqual({ ok: false, reason: "missing" });
    expect(verifySignature(SECRET, "abc", body, sig, now)).toEqual({ ok: false, reason: "stale" });
  });
});

describe("payload validation", () => {
  it("accepts a valid pixel event and normalises the currency", () => {
    const r = pixelPayloadSchema.safeParse({ pixel: PIXEL, event: "purchase", event_id: "o-1", consent: true, value: 19.99, currency: "eur" });
    expect(r.success && r.data.currency).toBe("EUR");
  });

  it("rejects unknown fields, bad pixels, value without currency and unnamed custom events", () => {
    expect(pixelPayloadSchema.safeParse({ pixel: PIXEL, event: "lead", event_id: "x", consent: true, email: "a@b.c" }).success).toBe(false);
    expect(pixelPayloadSchema.safeParse({ pixel: "nope", event: "lead", event_id: "x", consent: true }).success).toBe(false);
    expect(pixelPayloadSchema.safeParse({ pixel: PIXEL, event: "purchase", event_id: "x", consent: true, value: 5 }).success).toBe(false);
    expect(pixelPayloadSchema.safeParse({ pixel: PIXEL, event: "custom", event_id: "x", consent: true }).success).toBe(false);
    expect(pixelPayloadSchema.safeParse({ pixel: PIXEL, event: "signup", event_id: "x", consent: true }).success).toBe(false);
  });

  it("requires affirmed consent on the server API", () => {
    expect(serverPayloadSchema.safeParse({ event: "lead", event_id: "x", consent: false }).success).toBe(false);
    expect(serverPayloadSchema.safeParse({ event: "lead", event_id: "x", consent: true, occurred_at: "2026-11-20T10:00:00Z" }).success).toBe(true);
  });

  it("strips query strings and fragments from page URLs", () => {
    expect(sanitizePageUrl("https://shop.example.com/thanks?email=a@b.c#x")).toBe("https://shop.example.com/thanks");
    expect(sanitizePageUrl("not a url")).toBeNull();
  });

  it("reads the request host from Origin, falling back to Referer", () => {
    expect(requestHost(new Headers({ origin: "https://Shop.Example.com" }))).toBe("shop.example.com");
    expect(requestHost(new Headers({ referer: "https://www.example.com/p?q=1" }))).toBe("www.example.com");
    expect(requestHost(new Headers({ origin: "null" }))).toBeNull();
    expect(requestHost(new Headers())).toBeNull();
  });

  it("converts values to minor units per currency", () => {
    expect(toMinor(19.99, "USD")).toBe(1999);
    expect(toMinor(1500, "JPY")).toBe(1500);
  });
});

describe("pixel script", () => {
  function load(search: string) {
    const beacons: string[] = [];
    const store = new Map<string, string>();
    const window: Record<string, unknown> = {
      location: { search, origin: "https://shop.example.com", pathname: "/thanks" },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      navigator: {
        sendBeacon: (_url: string, blob: { parts: string[] }) => {
          beacons.push(blob.parts.join(""));
          return true;
        },
      },
      crypto: { randomUUID: () => "uuid-1" },
    };
    class FakeBlob {
      constructor(public parts: string[]) {}
    }
    const queue: unknown[][] = [["init", PIXEL]];
    window.elvora = Object.assign(() => undefined, { q: queue });
    runInNewContext(pixelScript("https://elvora.test/api/ads/collect"), { window, Blob: FakeBlob, JSON, Date, Math, String });
    return { api: window.elvora as (...a: unknown[]) => void, beacons };
  }

  it("sends nothing until consent, then flushes queued events with the click id", () => {
    const cid = "11111111-1111-4111-8111-111111111111";
    const { api, beacons } = load(`?utm_source=x&elv_cid=${cid}`);
    api("track", "lead", { value: 10, currency: "USD" });
    expect(beacons).toHaveLength(0);
    api("consent", true);
    expect(beacons).toHaveLength(1);
    const sent = JSON.parse(beacons[0]!);
    expect(sent).toMatchObject({ pixel: PIXEL, event: "lead", consent: true, elv_cid: cid, value: 10, currency: "USD", page_url: "https://shop.example.com/thanks" });
    expect(pixelPayloadSchema.safeParse(sent).success).toBe(true);
  });

  it("drops queued events if consent is refused", () => {
    const { api, beacons } = load("");
    api("track", "lead");
    api("consent", false);
    api("track", "lead");
    expect(beacons).toHaveLength(0);
  });
});
