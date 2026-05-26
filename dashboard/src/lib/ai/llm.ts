import type { LLMCompletionRequest, LLMCompletionResponse, LLMConfig } from "./types";

const defaultConfig: LLMConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 1024,
};

let currentConfig: LLMConfig = { ...defaultConfig };

export function configureLLM(config: Partial<LLMConfig>) {
  currentConfig = { ...currentConfig, ...config };
}

export function getLLMConfig(): LLMConfig {
  return { ...currentConfig };
}

const API_BASE = "https://api.openai.com/v1";

export async function complete(
  request: LLMCompletionRequest,
  config?: Partial<LLMConfig>
): Promise<LLMCompletionResponse> {
  const mergedConfig = { ...currentConfig, ...config };
  const apiKey = mergedConfig.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return simulateCompletion(request);
  }

  try {
    const baseUrl = mergedConfig.baseUrl || API_BASE;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: mergedConfig.model,
        messages: request.messages,
        temperature: request.temperature ?? mergedConfig.temperature,
        max_tokens: request.maxTokens ?? mergedConfig.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0]?.message?.content ?? "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    console.warn("LLM API call failed, falling back to simulation:", error);
    return simulateCompletion(request);
  }
}

function generateFallbackResponse(
  userContent: string,
  systemContext: string
): string {
  const lower = userContent.toLowerCase();
  const greeting = systemContext
    ? `Based on my role, ${systemContext.split(".")[0].toLowerCase()}. `
    : "";

  if (lower.includes("hello") || lower.includes("hi")) {
    return `${greeting}Hello! Thank you for reaching out. How can I assist you today?`;
  }
  if (
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("pricing")
  ) {
    return `${greeting}Great question about pricing! We offer several plans starting at $29.99 per month. Our Professional plan at $99.99 is our most popular option. Would you like more details about any specific plan?`;
  }
  if (lower.includes("demo") || lower.includes("trial")) {
    return `${greeting}Absolutely! We offer a 14-day free trial with full access to all features. Would you like me to schedule a personalized walkthrough with our product team?`;
  }
  if (
    lower.includes("support") ||
    lower.includes("help") ||
    lower.includes("issue")
  ) {
    return `${greeting}I'd be happy to help resolve that. Could you provide more detail about what you're experiencing? I'll check our resources for the best solution.`;
  }
  if (
    lower.includes("bye") ||
    lower.includes("goodbye") ||
    lower.includes("end call")
  ) {
    return `Thank you for your time! It was great speaking with you. Have a wonderful day!`;
  }
  return `${greeting}Thank you for sharing that. I'd like to learn more so I can provide the best assistance. Could you tell me more about your specific needs?`;
}

function simulateCompletion(request: LLMCompletionRequest): LLMCompletionResponse {
  const lastUserMessage = [...request.messages]
    .reverse()
    .find((m) => m.role === "user");

  const systemMessage = request.messages.find((m) => m.role === "system");

  const userContent = lastUserMessage?.content ?? "";
  const systemContext = systemMessage?.content ?? "";

  const response = generateFallbackResponse(userContent, systemContext);

  return {
    content: response,
    usage: {
      promptTokens: systemContext.length + userContent.length,
      completionTokens: response.length,
      totalTokens: systemContext.length + userContent.length + response.length,
    },
  };
}

export async function* completeStream(
  request: LLMCompletionRequest,
  config?: Partial<LLMConfig>
): AsyncGenerator<string> {
  const mergedConfig = { ...currentConfig, ...config };
  const apiKey = mergedConfig.apiKey || process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const baseUrl = mergedConfig.baseUrl || API_BASE;
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: mergedConfig.model,
          messages: request.messages,
          temperature: request.temperature ?? mergedConfig.temperature,
          max_tokens: request.maxTokens ?? mergedConfig.maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip malformed chunks
          }
        }
      }
      return;
    } catch (error) {
      console.warn("LLM stream failed, falling back to simulation:", error);
    }
  }

  // Simulate streaming — yield incrementally from the start
  const systemMessage = request.messages.find((m) => m.role === "system");
  const lastUserMessage = [...request.messages]
    .reverse()
    .find((m) => m.role === "user");
  const systemContext = systemMessage?.content ?? "";
  const userContent = lastUserMessage?.content ?? "";
  const response = generateFallbackResponse(userContent, systemContext);

  // Stream word by word with variable timing for natural feel
  const words = response.split(" ");
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const space = i < words.length - 1 ? " " : "";
    yield word + space;
    // Variable delay: pause longer at punctuation
    const delay = word.endsWith(".") || word.endsWith("?") || word.endsWith("!")
      ? 200
      : word.endsWith(",")
      ? 100
      : 40;
    await new Promise((r) => setTimeout(r, delay));
  }
}
