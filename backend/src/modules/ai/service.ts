import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { serverEnv } from "@backend/core/env";
import { logger } from "@backend/core/logger";

export const AI_MODEL = "claude-opus-5-5";

export const REFINE_MODES = ["polish", "concise", "professional", "warmer"] as const;
export type RefineMode = (typeof REFINE_MODES)[number];

export const refineSchema = z.object({
  draft: z.string().trim().min(10, { error: "Write a little more first (10+ characters)." }).max(3000),
  mode: z.enum(REFINE_MODES).default("polish"),
});

/** True when AI assistance is configured on the server. The UI hides AI features otherwise. */
export function isAiConfigured(): boolean {
  return Boolean(serverEnv().ANTHROPIC_API_KEY);
}

const INSTRUCTIONS: Record<RefineMode, string> = {
  polish: "Improve clarity, flow and grammar while keeping the author's voice, meaning and length roughly the same.",
  concise: "Make it noticeably shorter and sharper. Keep every concrete fact, name and number.",
  professional: "Make the tone more polished and professional, suited to founders, executives and investors.",
  warmer: "Make the tone warmer and more personal while staying professional.",
};

// Stable system prompt (kept byte-identical across requests so it can be cached).
const SYSTEM = `You help members of ELVORA, a private professional network, refine posts they are about to publish.
Rewrite only the draft you are given. Rules:
- Keep the author's facts, claims, names, numbers, links, #hashtags and @mentions exactly as written. Never invent achievements, figures, people or events.
- Write in the same language as the draft.
- No preamble, quotes, headings or commentary: reply with the rewritten post text only.
- Plain text. Keep line breaks where they help readability. Do not add emojis or hashtags the author didn't use.
- If the draft is not something you can help rewrite, reply with exactly: CANNOT_REFINE`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = serverEnv().ANTHROPIC_API_KEY;
  if (!apiKey) throw new AppError("service_unavailable", "AI writing assistance isn't configured.");
  client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 30_000 });
  return client;
}

/**
 * Refines a draft post. The member always reviews the suggestion before posting; nothing is
 * published automatically. Returns the suggested text only.
 */
export async function refinePost(input: z.infer<typeof refineSchema>): Promise<{ text: string }> {
  const anthropic = getClient();
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await anthropic.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      output_config: { effort: "low" },
      // Server-side refusal fallback: on a policy decline the API retries on a suitable model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Task: ${INSTRUCTIONS[input.mode]}\n\n<draft>\n${input.draft}\n</draft>` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new AppError("rate_limited", "The writing assistant is busy. Please try again in a moment.");
    if (error instanceof Anthropic.AuthenticationError) {
      logger.error("ai.auth_failed", {});
      throw new AppError("service_unavailable", "AI writing assistance is temporarily unavailable.");
    }
    if (error instanceof Anthropic.APIError) {
      logger.warn("ai.request_failed", { status: error.status });
      throw new AppError("service_unavailable", "AI writing assistance is temporarily unavailable.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new AppError("business_rule", "The assistant can't help rewrite this draft.");
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text || text === "CANNOT_REFINE") throw new AppError("business_rule", "The assistant can't help rewrite this draft.");
  return { text: text.slice(0, 3000) };
}
