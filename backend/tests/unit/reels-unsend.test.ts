import { describe, expect, it } from "vitest";
import { canUnsend, UNSEND_WINDOW_MS } from "@backend/modules/messaging/types";
import { createReelSchema, reelFeedQuery, shareReelSchema } from "@backend/modules/reels/schemas";
import { checkReelVideo, compactCount, reelIdFromText } from "@backend/modules/reels/types";

const ME = "00000000-0000-4000-8000-000000000001";
const REEL = "3f2b6c1e-8a4d-4f7b-9c2e-1d5a6b7c8d9e";

describe("canUnsend", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  const msg = (agoMs: number, over: Partial<{ senderId: string; unsentAt: string | null }> = {}) => ({
    senderId: ME,
    createdAt: new Date(now - agoMs).toISOString(),
    unsentAt: null,
    ...over,
  });

  it("allows the sender inside the 10-minute window only", () => {
    expect(UNSEND_WINDOW_MS).toBe(600_000);
    expect(canUnsend(msg(60_000), ME, now)).toBe(true);
    expect(canUnsend(msg(UNSEND_WINDOW_MS - 1), ME, now)).toBe(true);
    expect(canUnsend(msg(UNSEND_WINDOW_MS), ME, now)).toBe(false);
  });

  it("never for other people's or already-unsent messages", () => {
    expect(canUnsend(msg(1000, { senderId: "someone-else" }), ME, now)).toBe(false);
    expect(canUnsend(msg(1000, { unsentAt: new Date(now).toISOString() }), ME, now)).toBe(false);
  });
});

describe("reel helpers", () => {
  it("finds reel links in message text", () => {
    expect(reelIdFromText(`Look at this\nhttps://elvora.app/reels/${REEL}`)).toBe(REEL);
    expect(reelIdFromText(`/reels/${REEL.toUpperCase()}`)).toBe(REEL);
    expect(reelIdFromText(`https://elvora.app/reels/${REEL}abc`)).toBeNull();
    expect(reelIdFromText("no links here")).toBeNull();
  });

  it("formats compact counts without rounding up", () => {
    expect(compactCount(999)).toBe("999");
    expect(compactCount(1000)).toBe("1K");
    expect(compactCount(1250)).toBe("1.2K");
    expect(compactCount(3_499_999)).toBe("3.4M");
  });

  it("checks picked videos", () => {
    expect(checkReelVideo({ type: "video/quicktime", size: 10 }, 10)).toMatch(/MP4/);
    expect(checkReelVideo({ type: "video/mp4", size: 101 * 1024 * 1024 }, 10)).toMatch(/100 MB/);
    expect(checkReelVideo({ type: "video/mp4", size: 1000 }, 91)).toMatch(/90 seconds/);
    expect(checkReelVideo({ type: "video/mp4", size: 1000 }, Number.NaN)).toMatch(/couldn't read/);
    expect(checkReelVideo({ type: "video/webm", size: 1000 }, 30)).toBeNull();
  });

  it("validates reel creation and sharing input", () => {
    const base = { videoPath: `${ME}/reel_video/${REEL}.mp4`, durationS: 12.3, width: 1080, height: 1920 };
    expect(createReelSchema.safeParse(base).success).toBe(true);
    expect(createReelSchema.safeParse({ ...base, durationS: 95 }).success).toBe(false);
    expect(createReelSchema.safeParse({ ...base, videoPath: `${ME}/../x.mp4` }).success).toBe(false);
    expect(createReelSchema.safeParse({ ...base, visibility: "public" }).success).toBe(false);
    expect(shareReelSchema.safeParse({ conversationIds: [] }).success).toBe(false);
    expect(reelFeedQuery.parse({ exclude: `${REEL},${REEL}` }).exclude).toEqual([REEL, REEL]);
    expect(reelFeedQuery.safeParse({ exclude: "not-a-uuid" }).success).toBe(false);
  });
});
