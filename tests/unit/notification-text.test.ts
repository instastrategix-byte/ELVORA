import { describe, expect, it } from "vitest";
import { describeNotification } from "@/lib/notification-text";
import type { NotificationView } from "@backend/modules/notifications/service";

const base = (over: Partial<NotificationView>): NotificationView => ({
  id: "n",
  type: "message",
  actor: { id: "a", handle: "ana", displayName: "Ana", headline: null, location: null, avatarUrl: null, verifiedKinds: [] },
  entityType: null,
  entityId: "e",
  payload: {},
  readAt: null,
  createdAt: "2026-11-18T00:00:00Z",
  ...over,
});

describe("describeNotification", () => {
  it("describes introductions at every stage with the right destination", () => {
    expect(describeNotification(base({ type: "introduction", payload: { status: "pending" } }))).toEqual({
      text: "Ana asked you for an introduction",
      href: "/introductions",
    });
    expect(describeNotification(base({ type: "introduction", payload: { status: "accepted" } })).href).toBe("/introductions?tab=sent");
  });

  it("tells inviters when someone applies with their invitation", () => {
    expect(describeNotification(base({ type: "referral_joined" }))).toEqual({ text: "Ana applied to ELVORA with your invitation", href: "/account/referrals" });
  });

  it("still describes event updates", () => {
    expect(describeNotification(base({ type: "event_update", payload: { status: "cancelled", title: "Gala" } })).text).toBe("“Gala” has been cancelled");
  });
});
