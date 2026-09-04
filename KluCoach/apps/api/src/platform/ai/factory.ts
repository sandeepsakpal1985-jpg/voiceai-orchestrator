import { config } from "../../config.js";
import type { AiProvider } from "./provider.js";
import { OpenAiProvider } from "./openai-provider.js";
import { TestAiProvider } from "./test-provider.js";

export function aiEnabledNow() {
  if (process.env.AI_ENABLED === "false") return false;
  if (process.env.AI_ENABLED === "true") return true;
  return config.aiEnabled;
}

export function aiProviderNameNow() {
  return process.env.AI_PROVIDER || config.aiProvider || "none";
}

export function getAiProvider(): AiProvider | null {
  if (!aiEnabledNow()) return null;
  const name = aiProviderNameNow();
  if (name === "test" && !config.isProduction) {
    return new TestAiProvider();
  }
  if (name === "openai") {
    const key = process.env.AI_API_KEY || config.aiApiKey;
    if (!key) return null;
    return new OpenAiProvider({
      apiKey: key,
      model: process.env.AI_MODEL || config.aiModel,
    });
  }
  return null;
}
