import { describe, expect, it } from "vitest";
import { checkAttachment, formatBytes, resolveMimeType, sanitizeFileName } from "@backend/modules/messaging/attachments";
import { sendMessageSchema } from "@backend/modules/messaging/schemas";

describe("checkAttachment", () => {
  it("accepts photos, videos and office documents within the limits", () => {
    expect(checkAttachment({ name: "IMG_1.JPG", type: "image/jpeg", size: 2_000_000 })).toEqual({ ok: true, mimeType: "image/jpeg", kind: "image" });
    expect(checkAttachment({ name: "clip.mov", type: "video/quicktime", size: 10_000_000 })).toMatchObject({ ok: true, kind: "video" });
    expect(checkAttachment({ name: "Deck.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: 5_000 })).toMatchObject({
      ok: true,
      kind: "document",
    });
  });

  it("infers the type from the extension when the browser reports none", () => {
    expect(resolveMimeType("Budget.xlsx", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(checkAttachment({ name: "Budget.xlsx", type: "", size: 100 })).toMatchObject({ ok: true, kind: "document" });
  });

  it("rejects executables, scripts and active content whatever type is claimed", () => {
    for (const name of ["setup.exe", "run.sh", "page.html", "logo.svg", "macro.docm", "app.apk"]) {
      expect(checkAttachment({ name, type: "application/pdf", size: 100 }).ok).toBe(false);
    }
  });

  it("rejects mismatched extensions, empty and oversized files", () => {
    expect(checkAttachment({ name: "photo.pdf", type: "image/jpeg", size: 100 }).ok).toBe(false);
    expect(checkAttachment({ name: "a.pdf", type: "application/pdf", size: 0 }).ok).toBe(false);
    const big = checkAttachment({ name: "a.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 });
    expect(big).toEqual({ ok: false, error: "a.jpg: images must be 15 MB or smaller." });
  });
});

describe("helpers", () => {
  it("sanitizes file names", () => {
    expect(sanitizeFileName("../../etc/pass<wd>.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("   ")).toBe("attachment");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("sendMessageSchema", () => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  it("allows attachment-only messages but not empty ones", () => {
    expect(sendMessageSchema.safeParse({ clientId, body: "" }).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({ clientId, attachments: [{ path: "a/b/c.jpg-long-enough", fileName: "c.jpg", mimeType: "image/jpeg", size: 10 }] }).success,
    ).toBe(true);
    expect(sendMessageSchema.safeParse({ clientId, body: "Hello" }).success).toBe(true);
  });

  it("caps attachments at 10", () => {
    const att = { path: "a/b/c.jpg-long-enough", fileName: "c.jpg", mimeType: "image/jpeg", size: 10 };
    expect(sendMessageSchema.safeParse({ clientId, attachments: Array(11).fill(att) }).success).toBe(false);
  });
});
