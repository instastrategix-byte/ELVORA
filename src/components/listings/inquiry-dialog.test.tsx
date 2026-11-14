// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders } from "../../../tests/helpers/render";
import { InquiryDialog } from "./inquiry-dialog";

afterEach(() => vi.unstubAllGlobals());

const LISTING = "22222222-2222-4222-8222-222222222222";

describe("InquiryDialog", () => {
  it("validates on the client before calling the API", async () => {
    const { fn } = mockFetch();
    renderWithProviders(<InquiryDialog listingId={LISTING} listingTitle="Villa Lumière" />);
    await userEvent.click(screen.getByRole("button", { name: /send an inquiry/i }));
    await userEvent.type(screen.getByLabelText(/message/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: "Send inquiry" }));
    expect(await screen.findByText(/10\+ characters/)).toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });

  it("submits and states clearly that nothing is booked", async () => {
    const { calls } = mockFetch({ status: 201, body: { data: { id: "x", status: "new" } } });
    renderWithProviders(<InquiryDialog listingId={LISTING} listingTitle="Villa Lumière" />);
    await userEvent.click(screen.getByRole("button", { name: /send an inquiry/i }));
    await userEvent.type(screen.getByLabelText(/message/i), "Is the villa available in July for six guests?");
    await userEvent.type(screen.getByLabelText(/party size/i), "6");
    await userEvent.click(screen.getByRole("button", { name: "Send inquiry" }));
    expect(await screen.findByText("Your inquiry has been sent.")).toBeInTheDocument();
    expect(screen.getByText(/not a reservation/i)).toBeInTheDocument();
    expect(JSON.parse(String(calls[0]!.init?.body))).toMatchObject({ partySize: 6 });
  });

  it("shows the server's permission error", async () => {
    mockFetch({ status: 403, body: { error: { code: "forbidden", message: "Direct inquiries are included with Premium membership." } } });
    renderWithProviders(<InquiryDialog listingId={LISTING} listingTitle="Villa Lumière" />);
    await userEvent.click(screen.getByRole("button", { name: /send an inquiry/i }));
    await userEvent.type(screen.getByLabelText(/message/i), "Is the villa available in July?");
    await userEvent.click(screen.getByRole("button", { name: "Send inquiry" }));
    expect(await screen.findByText(/included with Premium/)).toBeInTheDocument();
  });
});
