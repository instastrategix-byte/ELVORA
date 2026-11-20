import { describe, expect, it } from "vitest";
import { introductionStatusLabel, introductionStep } from "@/components/introductions/introduction-card";
import { describeNotification } from "@/lib/notification-text";
import { RELATIONSHIP_LABELS, VOUCH_RELATIONSHIPS, vouchSummary } from "@backend/modules/vouches/constants";
import { refereeSchema, respondVouchRequestSchema, vouchSchema } from "@backend/modules/vouches/service";
import type { NotificationView } from "@backend/modules/notifications/service";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("vouchSummary", () => {
  it("names up to two vouchers and counts the rest", () => {
    expect(vouchSummary([], 0)).toBe("No vouches yet");
    expect(vouchSummary(["Ana"], 1)).toBe("Vouched for by Ana");
    expect(vouchSummary(["Ana", "Ben"], 2)).toBe("Vouched for by Ana and Ben");
    expect(vouchSummary(["Ana", "Ben", "Cal"], 3)).toBe("Vouched for by Ana, Ben and 1 other");
    expect(vouchSummary(["Ana", "Ben", "Cal", "Dee"], 4)).toBe("Vouched for by Ana, Ben and 2 others");
  });

  it("labels every relationship", () => {
    for (const r of VOUCH_RELATIONSHIPS) expect(RELATIONSHIP_LABELS[r]).toBeTruthy();
  });
});

describe("vouch schemas", () => {
  it("limits notes to 280 characters and requires a relationship to accept", () => {
    expect(vouchSchema.safeParse({ voucheeId: UUID, relationship: "client", note: "x".repeat(281) }).success).toBe(false);
    expect(vouchSchema.safeParse({ voucheeId: UUID, relationship: "client", note: "Great partner" }).success).toBe(true);
    expect(respondVouchRequestSchema.safeParse({ accept: true }).success).toBe(false);
    expect(respondVouchRequestSchema.safeParse({ accept: false }).success).toBe(true);
  });

  it("normalises referee handles", () => {
    expect(refereeSchema.parse({ handle: " @Ana_V " }).handle).toBe("ana_v");
    expect(refereeSchema.safeParse({ handle: "a b" }).success).toBe(false);
  });
});

describe("introduction status for each role", () => {
  it("never tells the requester who declined", () => {
    expect(introductionStatusLabel("unavailable", "requester").label).toBe("Not available right now");
    expect(introductionStatusLabel("declined", "target").label).toBe("You declined");
    expect(introductionStatusLabel("pending", "introducer").label).toBe("Waiting for you");
    expect(introductionStatusLabel("forwarded", "target").label).toBe("Waiting for you");
    expect(introductionStatusLabel("forwarded", "requester").label).toMatch(/Introduced/);
  });

  it("maps statuses to stepper progress", () => {
    expect(introductionStep("pending")).toBe(1);
    expect(introductionStep("forwarded")).toBe(2);
    expect(introductionStep("accepted")).toBe(3);
    expect(introductionStep("unavailable")).toBe(1);
  });
});

describe("notification text", () => {
  const base = (over: Partial<NotificationView>): NotificationView =>
    ({
      id: "n",
      type: "vouch_received",
      actor: { id: UUID, handle: "ana", displayName: "Ana", headline: null, location: null, avatarUrl: null, verifiedKinds: [] },
      entityType: null,
      entityId: null,
      payload: {},
      readAt: null,
      createdAt: new Date().toISOString(),
      ...over,
    }) as NotificationView;

  it("describes vouches and requests", () => {
    expect(describeNotification(base({}))).toEqual({ text: "Ana vouched for you", href: "/vouches?tab=received" });
    expect(describeNotification(base({ type: "vouch_requested" })).text).toBe("Ana asked you to vouch for them");
    expect(describeNotification(base({ type: "vouch_requested", payload: { application: true } })).text).toBe("Ana named you as a referee on their application");
  });

  it("reports an unavailable introduction without naming anyone", () => {
    const t = describeNotification(base({ type: "introduction", actor: null, payload: { status: "unavailable" } }));
    expect(t.text).toBe("An introduction you asked for isn't available right now");
  });
});
