import type { AiGenerateInput, AiGenerateResult, AiProvider } from "./provider.js";

/** HTTPS Chat Completions. Domain code must not import OpenAI SDK types. */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(
    private cfg: {
      apiKey: string;
      model: string;
    },
  ) {}

  async generateResponse(input: AiGenerateInput): Promise<AiGenerateResult> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.cfg.model,
        max_tokens: input.maxOutputTokens,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: `Context JSON:\n${input.contextJson}\n\nQuestion:\n${input.userMessage}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error("AI_PROVIDER_UNAVAILABLE");
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("AI_PROVIDER_UNAVAILABLE");
    return { text, model: body.model ?? this.cfg.model };
  }
}
