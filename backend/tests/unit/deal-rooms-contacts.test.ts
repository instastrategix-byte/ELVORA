import { describe, expect, it } from "vitest";
import { describeNotification } from "@/lib/notification-text";
import { contactNoteSchema, filterContacts, reminderCreateSchema, sortContacts, today, type ContactRow } from "@backend/modules/contacts/service";
import { checkDealRoomFile, DEAL_ROOM_MAX_BYTES } from "@backend/modules/deal-rooms/constants";
import { dealRoomDocumentSchema, dealRoomSchema } from "@backend/modules/deal-rooms/service";
import type { NotificationView } from "@backend/modules/notifications/service";

const person = (id: string, displayName: string) => ({ id, handle: id, displayName, headline: null, location: null, avatarUrl: null, verifiedKinds: [] });
const row = (id: string, name: string, extra: Partial<ContactRow> = {}): ContactRow => ({ person: person(id, name), note: null, reminders: [], dueOn: null, ...extra });
const note = (o: Partial<NonNullable<ContactRow["note"]>>) => ({ body: "", tags: [], stage: "none" as const, lastContactedOn: null, updatedAt: "2026-01-01", ...o });

describe("contacts", () => {
  it("sorts due follow-ups first, then most recently contacted, then by name", () => {
    const sorted = sortContacts([
      row("a", "Zed"),
      row("b", "Amy", { note: note({ lastContactedOn: "2026-03-01" }) }),
      row("c", "Bob", { dueOn: "2026-05-02" }),
      row("d", "Cat", { dueOn: "2026-05-01" }),
      row("e", "Abe"),
    ]);
    expect(sorted.map((r) => r.person.displayName)).toEqual(["Cat", "Bob", "Amy", "Abe", "Zed"]);
  });

  it("filters by text across notes and tags, stage, tag and due", () => {
    const rows = [
      row("a", "Ana", { note: note({ body: "Met in Monaco", tags: ["investor"], stage: "warm" }) }),
      row("b", "Ben", { dueOn: "2026-01-01" }),
    ];
    expect(filterContacts(rows, { q: "monaco" }).map((r) => r.person.id)).toEqual(["a"]);
    expect(filterContacts(rows, { q: "INVESTOR" }).map((r) => r.person.id)).toEqual(["a"]);
    expect(filterContacts(rows, { stage: "none" }).map((r) => r.person.id)).toEqual(["b"]);
    expect(filterContacts(rows, { tag: "investor" }).map((r) => r.person.id)).toEqual(["a"]);
    expect(filterContacts(rows, { due: true }).map((r) => r.person.id)).toEqual(["b"]);
  });

  it("validates notes and reminders", () => {
    expect(contactNoteSchema.safeParse({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(contactNoteSchema.safeParse({ tags: ["x".repeat(33)] }).success).toBe(false);
    expect(contactNoteSchema.parse({}).stage).toBe("none");
    expect(reminderCreateSchema.safeParse({ dueOn: "2026-02-30", body: "x" }).success).toBe(false);
    expect(reminderCreateSchema.safeParse({ dueOn: "2026-02-03", body: "  " }).success).toBe(false);
    expect(today(new Date("2026-04-05T23:30:00Z"))).toBe("2026-04-05");
  });
});

describe("deal rooms", () => {
  it("requires NDA text when an NDA is required", () => {
    expect(dealRoomSchema.safeParse({ name: "Atlas", ndaRequired: true, ndaText: "short" }).success).toBe(false);
    expect(dealRoomSchema.safeParse({ name: "Atlas", ndaRequired: true, ndaText: "These terms are long enough." }).success).toBe(true);
    expect(dealRoomSchema.safeParse({ name: "At" }).success).toBe(false);
  });

  it("only accepts allowed document types up to 50 MB", () => {
    expect(checkDealRoomFile({ type: "application/pdf", size: 1000 }).ok).toBe(true);
    expect(checkDealRoomFile({ type: "application/zip", size: 1000 }).ok).toBe(false);
    expect(checkDealRoomFile({ type: "image/png", size: DEAL_ROOM_MAX_BYTES + 1 }).ok).toBe(false);
    expect(checkDealRoomFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(dealRoomDocumentSchema.safeParse({ path: "x", fileName: "a.pdf", mimeType: "application/pdf", size: -1 }).success).toBe(false);
  });

  it("describes deal room notifications", () => {
    const base = { id: "n", actor: { displayName: "Ana", handle: "ana" }, readAt: null, createdAt: "2026-01-01", entityType: "deal_room" } as unknown as NotificationView;
    expect(describeNotification({ ...base, type: "deal_room_invite", entityId: "r1", payload: { name: "Atlas" } } as NotificationView)).toEqual({
      text: "Ana invited you to the deal room “Atlas”",
      href: "/deal-rooms",
    });
    expect(describeNotification({ ...base, type: "deal_room_document", entityId: "r1", payload: { name: "Atlas", file: "Model.xlsx" } } as NotificationView)).toEqual({
      text: "Ana shared Model.xlsx in “Atlas”",
      href: "/deal-rooms/r1",
    });
  });
});
