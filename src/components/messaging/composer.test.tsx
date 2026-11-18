// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/helpers/render";

const uploadAttachment = vi.fn();
vi.mock("@/lib/attachment-upload", () => ({ uploadAttachment: (...args: unknown[]) => uploadAttachment(...args) }));
const remove = vi.fn().mockResolvedValue({});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ remove }) } }) }));

import { Composer } from "./composer";

beforeEach(() => {
  uploadAttachment.mockReset();
  remove.mockClear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

function pick(input: HTMLElement, files: File[]) {
  fireEvent.change(input, { target: { files } });
}

describe("Composer", () => {
  it("uploads a document, lets it be removed before sending, and deletes the unsent upload", async () => {
    uploadAttachment.mockResolvedValue({ path: "c/u/x.pdf", fileName: "Plan.pdf", mimeType: "application/pdf", size: 3 });
    const onSend = vi.fn();
    const { container } = renderWithProviders(<Composer conversationId="c" placeholder="Message Ana" onSend={onSend} />);
    const docInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    pick(docInput, [new File(["pdf"], "Plan.pdf", { type: "application/pdf" })]);

    expect(await screen.findByText("Plan.pdf")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());

    await userEvent.click(screen.getByRole("button", { name: "Remove Plan.pdf" }));
    expect(screen.queryByText("Plan.pdf")).not.toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(["c/u/x.pdf"]);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("shows validation errors for blocked files and never uploads them", async () => {
    const { container } = renderWithProviders(<Composer conversationId="c" placeholder="Message Ana" onSend={vi.fn()} />);
    const docInput = container.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
    pick(docInput, [new File(["x"], "virus.exe", { type: "application/x-msdownload" })]);
    expect(await screen.findByRole("alert")).toHaveTextContent("can't be shared");
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("waits for uploads before sending, then sends text with the uploaded files", async () => {
    let finish: (v: unknown) => void = () => undefined;
    uploadAttachment.mockReturnValue(new Promise((r) => (finish = r)));
    const onSend = vi.fn();
    const { container } = renderWithProviders(<Composer conversationId="c" placeholder="Message Ana" onSend={onSend} />);
    const mediaInput = container.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
    pick(mediaInput, [new File(["img"], "beach.jpg", { type: "image/jpeg" })]);
    await userEvent.type(screen.getByLabelText("Message Ana"), "Look");
    expect(screen.getByRole("button", { name: "Waiting for uploads" })).toBeDisabled();

    finish({ path: "c/u/y.jpg", fileName: "beach.jpg", mimeType: "image/jpeg", size: 3 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Look", attachments: [expect.objectContaining({ path: "c/u/y.jpg" })] }),
    );
  });

  it("sends text on Enter and keeps Shift+Enter for new lines", async () => {
    const onSend = vi.fn();
    renderWithProviders(<Composer conversationId="c" placeholder="Message Ana" onSend={onSend} />);
    const box = screen.getByLabelText("Message Ana");
    await userEvent.type(box, "Hi{Shift>}{Enter}{/Shift}there{Enter}");
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ body: "Hi\nthere", attachments: [] }));
  });
});
