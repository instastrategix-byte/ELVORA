import { describe, expect, it } from "vitest";
import { afterSend, cooldownAfter, formatWait, RESEND_RESET_MS, secondsUntilAllowed } from "@backend/modules/auth/resend-policy";

describe("resend cooldown", () => {
  it("waits 60s for the first 5 sends, then 5 min, 15 min and 1 hour", () => {
    expect([1, 2, 3, 4, 5].map(cooldownAfter)).toEqual([60, 60, 60, 60, 60]);
    expect(cooldownAfter(6)).toBe(300);
    expect(cooldownAfter(7)).toBe(900);
    expect(cooldownAfter(8)).toBe(3600);
    expect(cooldownAfter(20)).toBe(3600);
    expect(cooldownAfter(0)).toBe(0);
  });

  it("counts sends and blocks until the cooldown passes", () => {
    const t0 = 1_000_000;
    let r = afterSend(undefined, t0);
    expect(r).toEqual({ n: 1, last: t0 });
    expect(secondsUntilAllowed(r, t0 + 1_000)).toBe(59);
    expect(secondsUntilAllowed(r, t0 + 60_000)).toBe(0);
    for (let i = 0; i < 5; i++) r = afterSend(r, t0 + 60_000 * (i + 1));
    expect(r.n).toBe(6);
    expect(secondsUntilAllowed(r, r.last)).toBe(300);
  });

  it("resets 24 hours after the last send", () => {
    const r = { n: 9, last: 0 };
    expect(secondsUntilAllowed(r, RESEND_RESET_MS)).toBe(0);
    expect(afterSend(r, RESEND_RESET_MS)).toEqual({ n: 1, last: RESEND_RESET_MS });
  });

  it("formats the countdown", () => {
    expect(formatWait(45)).toBe("45s");
    expect(formatWait(299)).toBe("4:59");
    expect(formatWait(3600)).toBe("1:00:00");
    expect(formatWait(-3)).toBe("0s");
  });
});
