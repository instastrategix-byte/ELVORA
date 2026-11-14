// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders } from "../../../tests/helpers/render";
import { SaveListingButton } from "./save-listing-button";

afterEach(() => vi.unstubAllGlobals());

describe("SaveListingButton", () => {
  it("toggles optimistically and keeps state when the API succeeds", async () => {
    mockFetch({ body: { data: { saved: true } } });
    renderWithProviders(<SaveListingButton listingId="l1" initialSaved={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Save listing" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove from saved" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("reverts when the API fails (e.g. expired session)", async () => {
    mockFetch({ status: 401, body: { error: { code: "unauthenticated", message: "Please sign in." } } });
    renderWithProviders(<SaveListingButton listingId="l1" initialSaved={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Save listing" }));
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save listing" })).toHaveAttribute("aria-pressed", "false");
  });
});
