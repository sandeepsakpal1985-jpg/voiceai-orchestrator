import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { config } from '../../config';

const FALLBACK_RESPONSE = 'I apologize, but I\'m having trouble processing your request right now. Please try again in a moment, or contact the business directly for assistance.';

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.openai.apiKey) return null;
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return _client;
}

export interface LLMCompletionOptions {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

function toChatMessage(msg: { role: string; content: string }): ChatCompletionMessageParam {
  return { role: msg.role as 'user' | 'assistant' | 'system', content: msg.content } as ChatCompletionMessageParam;
}

export async function generateCompletion(opts: LLMCompletionOptions): Promise<string> {
  const client = getClient();
  if (!client) {
    console.warn('[LLM] OpenAI not configured — returning fallback response');
    return FALLBACK_RESPONSE;
  }

  try {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: opts.systemPrompt },
      ...opts.messages.map(toChatMessage),
    ];

    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 500,
    });

    return response.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[LLM] generateCompletion failed:', err);
    return FALLBACK_RESPONSE;
  }
}

export async function generateJSON<T>(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<T> {
  const client = getClient();
  if (!client) {
    console.warn('[LLM] OpenAI not configured — returning empty JSON');
    return {} as T;
  }

  try {
    const msgs: ChatCompletionMessageParam[] = [
      { role: 'system', content: `${systemPrompt}\n\nRespond with valid JSON only.` },
      ...messages.map(toChatMessage),
    ];

    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: msgs,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('[LLM] generateJSON failed:', err);
    return {} as T;
  }
}
