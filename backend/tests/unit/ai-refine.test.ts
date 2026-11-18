import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

async function load(key: string | undefined) {
  vi.resetModules();
  if (key) vi.stubEnv("ANTHROPIC_API_KEY", key);
  else vi.stubEnv("ANTHROPIC_API_KEY", "");
  return import("@backend/modules/ai/service");
}

beforeEach(() => create.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("AI post refinement", () => {
  it("is off when no API key is configured", async () => {
    const ai = await load(undefined);
    expect(ai.isAiConfigured()).toBe(false);
    await expect(ai.refinePost({ draft: "A draft long enough", mode: "polish" })).rejects.toMatchObject({ code: "service_unavailable" });
    expect(create).not.toHaveBeenCalled();
  });

  it("sends the draft with the chosen instruction and returns only the text", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "  Polished post.  " }] });
    const ai = await load("test-key");
    await expect(ai.refinePost({ draft: "my rough draft about #yachting", mode: "concise" })).resolves.toEqual({ text: "Polished post." });
    const req = create.mock.calls[0]![0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.messages[0].content).toContain("my rough draft about #yachting");
    expect(req.messages[0].content).toContain("shorter");
  });

  it("treats refusals and CANNOT_REFINE as a clear, non-crashing error", async () => {
    const ai = await load("test-key");
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    await expect(ai.refinePost({ draft: "something to rewrite", mode: "polish" })).rejects.toMatchObject({ code: "business_rule" });
    create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "CANNOT_REFINE" }] });
    await expect(ai.refinePost({ draft: "something to rewrite", mode: "polish" })).rejects.toMatchObject({ code: "business_rule" });
  });
});
