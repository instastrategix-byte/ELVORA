// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch, renderWithProviders, routerMock } from "../../../tests/helpers/render";
import { OnboardingForm } from "./onboarding-form";

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OnboardingForm", () => {
  it("suggests a handle from the name", async () => {
    renderWithProviders(<OnboardingForm defaultName="New member" />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Elena Duarte");
    expect(screen.getByLabelText(/handle/i)).toHaveValue("elena_duarte");
  });

  it("rejects invalid handles without calling the API", async () => {
    const { fn } = mockFetch();
    renderWithProviders(<OnboardingForm defaultName="Elena" />);
    const handle = screen.getByLabelText(/handle/i);
    await userEvent.clear(handle);
    await userEvent.type(handle, "x!");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/3–30 characters/)).toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });

  it("maps server field errors (taken handle) back to the field", async () => {
    mockFetch({ status: 409, body: { error: { code: "conflict", message: "That handle is already taken.", fieldErrors: { handle: ["That handle is already taken"] } } } });
    renderWithProviders(<OnboardingForm defaultName="Elena Duarte" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("That handle is already taken")).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("continues to the welcome step on success", async () => {
    mockFetch({ status: 201, body: { data: { onboarded: true } } });
    renderWithProviders(<OnboardingForm defaultName="Elena Duarte" next="/apply" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/onboarding/welcome?next=%2Fapply"));
  });
});
