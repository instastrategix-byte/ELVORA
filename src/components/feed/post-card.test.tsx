// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders, routerMock } from "../../../tests/helpers/render";
import type { PostView } from "@backend/modules/feed/types";
import { PostCard } from "./post-card";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/feed" }));

const post: PostView = {
  id: "11111111-1111-4111-8111-111111111111",
  author: { id: "a", handle: "isabella", displayName: "Isabella Marchetti", headline: null, location: null, avatarUrl: null, verifiedKinds: ["executive"] },
  body: "Preview of the autumn collection.",
  visibility: "members",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  likeCount: 2,
  commentCount: 0,
  repostCount: 0,
  likedByViewer: false,
  savedByViewer: false,
  repostedByViewer: false,
  isOwn: false,
  media: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("PostCard", () => {
  it("renders author, verified badge and body", () => {
    renderWithProviders(<PostCard post={post} canInteract />);
    expect(screen.getByRole("link", { name: /Isabella Marchetti/ })).toHaveAttribute("href", "/members/isabella");
    expect(screen.getByText("Verified executive")).toBeInTheDocument();
    expect(screen.getByText(/autumn collection/)).toBeInTheDocument();
  });

  it("likes optimistically and reconciles with the server count", async () => {
    const { calls } = mockFetch({ body: { data: { likeCount: 7 } } });
    renderWithProviders(<PostCard post={post} canInteract />);
    const like = screen.getByRole("button", { name: "Like" });
    await userEvent.click(like);
    await waitFor(() => expect(screen.getByRole("button", { name: "Unlike" })).toHaveTextContent("7"));
    expect(calls[0]!.url).toBe(`/api/v1/posts/${post.id}/like`);
    expect(calls[0]!.init?.method).toBe("POST");
  });

  it("reverts the optimistic like and shows the error when the server refuses", async () => {
    mockFetch({ status: 403, body: { error: { code: "forbidden", message: "Your account is currently restricted." } } });
    renderWithProviders(<PostCard post={post} canInteract />);
    await userEvent.click(screen.getByRole("button", { name: "Like" }));
    expect(await screen.findByText("Your account is currently restricted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like" })).toHaveTextContent("2");
  });

  it("reposts optimistically and reconciles with the server count", async () => {
    const { calls } = mockFetch({ body: { data: { repostCount: 3 } } });
    renderWithProviders(<PostCard post={post} canInteract />);
    await userEvent.click(screen.getByRole("button", { name: "Repost" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo repost" })).toBeInTheDocument());
    expect(await screen.findByText("3 reposts")).toBeInTheDocument();
    expect(calls[0]!.url).toBe(`/api/v1/posts/${post.id}/repost`);
  });

  it("does not offer reposting for connections-only or own posts", () => {
    renderWithProviders(<PostCard post={{ ...post, visibility: "connections" }} canInteract />);
    expect(screen.getByRole("button", { name: /Repost unavailable/ })).toBeDisabled();
  });

  it("shows who reposted a post into the feed", () => {
    renderWithProviders(<PostCard post={{ ...post, repostedBy: { ...post.author, id: "b", handle: "marco", displayName: "Marco Ricci" } }} canInteract />);
    expect(screen.getByRole("link", { name: "Marco Ricci" })).toHaveAttribute("href", "/members/marco");
    expect(screen.getByText("reposted")).toBeInTheDocument();
  });

  it("disables interactions for viewers who cannot interact", () => {
    renderWithProviders(<PostCard post={post} canInteract={false} />);
    expect(screen.getByRole("button", { name: "Like" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Report")).not.toBeInTheDocument();
  });
});
