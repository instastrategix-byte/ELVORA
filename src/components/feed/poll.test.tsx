// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders, routerMock } from "../../../tests/helpers/render";
import type { PostPoll } from "@backend/modules/feed/types";
import { Poll } from "./poll";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/feed" }));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POST = "11111111-1111-4111-8111-111111111111";

const open: PostPoll = {
  question: "Where next?",
  options: [
    { id: A, label: "Monaco", votes: 3, voted: false },
    { id: B, label: "Aspen", votes: 1, voted: false },
  ],
  totalVotes: 4,
  closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  closed: false,
  allowMultiple: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("Poll", () => {
  it("offers a radio group before voting and shows server results after", async () => {
    const result: PostPoll = { ...open, options: [{ ...open.options[0]!, votes: 4, voted: true }, open.options[1]!], totalVotes: 5 };
    const { calls } = mockFetch({ body: { data: result } });
    renderWithProviders(<Poll postId={POST} poll={open} canVote />);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Monaco" }));
    await waitFor(() => expect(screen.getByText("80%")).toBeInTheDocument());
    expect(screen.getByLabelText("Your choice")).toBeInTheDocument();
    expect(screen.getByText("5 votes")).toBeInTheDocument();
    expect(calls[0]!.url).toBe(`/api/v1/posts/${POST}/poll/vote`);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ optionIds: [A] });
  });

  it("reverts the optimistic vote when the server refuses", async () => {
    mockFetch({ status: 409, body: { error: { code: "business_rule", message: "This poll has closed" } } });
    renderWithProviders(<Poll postId={POST} poll={open} canVote />);
    await userEvent.click(screen.getByRole("radio", { name: "Aspen" }));
    expect(await screen.findByText("This poll has closed")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Aspen" })).toBeInTheDocument();
  });

  it("shows final results, without voting controls, once closed", () => {
    renderWithProviders(<Poll postId={POST} poll={{ ...open, closed: true }} canVote />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Final results")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("uses checkboxes and an explicit Vote button for multiple choice", async () => {
    const { calls } = mockFetch({ body: { data: { ...open, allowMultiple: true } } });
    renderWithProviders(<Poll postId={POST} poll={{ ...open, allowMultiple: true }} canVote />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Monaco" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Aspen" }));
    await userEvent.click(screen.getByRole("button", { name: "Vote" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ optionIds: [A, B] });
  });
});
