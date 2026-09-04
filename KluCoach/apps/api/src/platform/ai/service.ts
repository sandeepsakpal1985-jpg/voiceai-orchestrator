import { aiAskResponseSchema, ERROR_CODES, type AiAskResponse } from "@klunex-edu/shared";
import { config } from "../../config.js";
import { ApiError, validationError } from "../../lib/errors.js";
import type { AiProvider } from "./provider.js";
import { promptFor, type PromptAudience } from "./prompts.js";
import type { AiCitation } from "./context.js";

export function disabledAiResponse(): AiAskResponse {
  return aiAskResponseSchema.parse({
    available: false,
    answer: "AI assistance is not enabled for this environment.",
    citations: [],
    contextVersion: null,
    provider: "none",
  });
}

export async function completeInsight(input: {
  enabled: boolean;
  provider: AiProvider | null;
  audience: PromptAudience;
  message: string;
  context: unknown;
  citations: AiCitation[];
  contextVersion: string;
}): Promise<AiAskResponse> {
  if (!input.enabled) return disabledAiResponse();
  if (!input.provider) {
    throw new ApiError(503, ERROR_CODES.AI_UNAVAILABLE, "AI assistance is temporarily unavailable. Please try again.");
  }
  const contextJson = JSON.stringify(input.context);
  if (contextJson.length > config.aiMaxInputChars) {
    throw validationError("AI context is too large for this request.");
  }
  const prompt = promptFor(input.audience);
  try {
    const result = await input.provider.generateResponse({
      system: prompt.text,
      userMessage: input.message,
      contextJson,
      maxOutputTokens: config.aiMaxOutputTokens,
    });
    return aiAskResponseSchema.parse({
      available: true,
      answer: result.text,
      citations: input.citations,
      contextVersion: input.contextVersion,
      provider: input.provider.name,
    });
  } catch {
    throw new ApiError(503, ERROR_CODES.AI_UNAVAILABLE, "AI assistance is temporarily unavailable. Please try again.");
  }
}
