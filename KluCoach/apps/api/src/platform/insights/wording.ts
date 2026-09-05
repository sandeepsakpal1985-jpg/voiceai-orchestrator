import { config } from "../../config.js";
import { aiEnabledNow, getAiProvider } from "../ai/factory.js";
import { FACTUAL_INSIGHT_WORDING_V1 } from "../ai/prompts.js";
import { containsForbiddenInsightLanguage, type DetectedInsight } from "./rules.js";

export function acceptEnhancedCopy(detected: DetectedInsight, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (containsForbiddenInsightLanguage(trimmed)) return false;
  const skip = new Set(["previousCount", "currentCount"]);
  const numbers = Object.entries(detected.source)
    .filter(([key, value]) => typeof value === "number" && !skip.has(key))
    .map(([, value]) => value as number);
  if (numbers.some((n) => !trimmed.includes(String(n)))) return false;
  return true;
}

export async function wordingFromProvider(
  detected: DetectedInsight,
  generate: () => Promise<{ text: string }>,
) {
  const factual = { title: detected.title, summary: detected.summary };
  try {
    const result = await generate();
    if (!acceptEnhancedCopy(detected, result.text)) return factual;
    return { title: detected.title, summary: result.text.trim() };
  } catch {
    return factual;
  }
}

/** Optional friendlier copy. Numbers always come from the factual insight. Default off. */
export async function maybeEnhanceInsightWording(detected: DetectedInsight) {
  const factual = { title: detected.title, summary: detected.summary };
  if (!config.insightAiWording || !aiEnabledNow()) return factual;
  const provider = getAiProvider();
  if (!provider) return factual;
  return wordingFromProvider(detected, () =>
    provider.generateResponse({
      system: FACTUAL_INSIGHT_WORDING_V1,
      userMessage: JSON.stringify({ title: detected.title, source: detected.source }),
      contextJson: JSON.stringify(detected.source),
      maxOutputTokens: Math.min(120, config.aiMaxOutputTokens),
    }),
  );
}
