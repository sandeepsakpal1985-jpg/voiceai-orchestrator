import { generateJSON } from './llm';

export interface ClassifiedComment {
  category: 'sales_inquiry' | 'product_question' | 'complaint' | 'legal_threat' | 'spam' | 'competitor_mention' | 'influencer_vip' | 'existing_customer' | 'general';
  sentiment: number;
  leadScore: number;
  urgencyScore: number;
  escalationScore: number;
  explanation: string;
}

export async function classifyComment(comment: string, authorName: string): Promise<ClassifiedComment> {
  return generateJSON<ClassifiedComment>(
    `You are an AI sales assistant analyzing social media comments.
    Classify the comment and return scores:
    - sentiment: -1.0 (very negative) to 1.0 (very positive)
    - leadScore: 0-100 (how likely this is a sales lead)
    - urgencyScore: 0-100 (how urgently this needs response)
    - escalationScore: 0-100 (how likely this needs human escalation)`,
    [
      { role: 'user', content: `Author: ${authorName}\nComment: ${comment}` },
    ],
  );
}

export async function classifyDMIntent(message: string): Promise<{
  intent: 'sales_inquiry' | 'support' | 'complaint' | 'pricing' | 'demo_request' | 'partnership' | 'general';
  leadScore: number;
  purchaseProbability: number;
  urgencyScore: number;
}> {
  return generateJSON(
    `You are an AI sales assistant analyzing DM messages.
    Classify the intent and return scores:
    - leadScore: 0-100
    - purchaseProbability: 0-100
    - urgencyScore: 0-100`,
    [{ role: 'user', content: `Message: ${message}` }],
  );
}
