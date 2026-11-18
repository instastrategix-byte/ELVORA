// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders } from "../../../tests/helpers/render";
import { EMOJI } from "./emoji-data";
import { EmojiPicker, searchEmoji } from "./emoji-picker";
import { applyReactionEvent, MessageReactions, toggleReaction } from "./message-reactions";

const MSG = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe("reaction helpers", () => {
  it("toggles the viewer's reaction locally", () => {
    const start = [{ emoji: "❤️", count: 2, reactedByViewer: false }];
    const added = toggleReaction(start, "❤️");
    expect(added).toEqual([{ emoji: "❤️", count: 3, reactedByViewer: true }]);
    expect(toggleReaction(added, "❤️")).toEqual(start);
    expect(toggleReaction([{ emoji: "👍", count: 1, reactedByViewer: true }], "👍")).toEqual([]);
  });

  it("applies realtime events from others and ignores duplicates of the viewer's own", () => {
    const list = [{ emoji: "🔥", count: 1, reactedByViewer: true }];
    expect(applyReactionEvent(list, { user_id: "other", emoji: "🔥", op: "add" }, "me")).toEqual([{ emoji: "🔥", count: 2, reactedByViewer: true }]);
    expect(applyReactionEvent(list, { user_id: "me", emoji: "🔥", op: "add" }, "me")).toEqual(list);
    expect(applyReactionEvent(list, { user_id: "me", emoji: "🔥", op: "remove" }, "me")).toEqual([]);
  });
});

describe("MessageReactions", () => {
  it("toggles optimistically and adopts the server summary", async () => {
    const { calls } = mockFetch({ body: { data: [{ emoji: "❤️", count: 3, reactedByViewer: true }] } });
    renderWithProviders(<MessageReactions messageId={MSG} reactions={[{ emoji: "❤️", count: 2, reactedByViewer: false }]} mine={false} />);
    const chip = screen.getByRole("button", { name: "Reacted with ❤️ by 2 people" });
    await userEvent.click(chip);
    await waitFor(() => expect(screen.getByRole("button", { name: "Reacted with ❤️ by you and 2 others" })).toHaveAttribute("aria-pressed", "true"));
    expect(calls[0]!.url).toBe(`/api/v1/messages/${MSG}/reactions`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ emoji: "❤️" });
  });

  it("rolls back and shows the error when the server refuses", async () => {
    mockFetch({ status: 403, body: { error: { code: "forbidden", message: "You are not allowed to do that." } } });
    renderWithProviders(<MessageReactions messageId={MSG} reactions={[{ emoji: "👍", count: 1, reactedByViewer: true }]} mine />);
    await userEvent.click(screen.getByRole("button", { name: "Reacted with 👍 by you" }));
    expect(await screen.findByText("You are not allowed to do that.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reacted with 👍 by you" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("emoji search and picker", () => {
  it("finds emoji by name and keywords, requiring every word", () => {
    expect(searchEmoji(EMOJI, "fire").map((r) => r[0])).toContain("🔥");
    expect(searchEmoji(EMOJI, "thumbs up").map((r) => r[0])).toContain("👍");
    expect(searchEmoji(EMOJI, "zzzz-not-an-emoji")).toEqual([]);
    expect(searchEmoji(EMOJI, "")).toEqual([]);
  });

  it("opens, searches and returns the chosen emoji", async () => {
    const onSelect = vi.fn();
    renderWithProviders(<EmojiPicker onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Add emoji" }));
    const search = await screen.findByRole("searchbox", { name: "Search emoji" });
    await userEvent.type(search, "party popper");
    const result = await screen.findByRole("gridcell", { name: "party popper" });
    await userEvent.click(result);
    expect(onSelect).toHaveBeenCalledWith("🎉");
  });
});
