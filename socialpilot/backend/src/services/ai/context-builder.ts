interface CustomerContext {
  name?: string;
  socialHandle: string;
  previousInteractions?: string;
  relationshipStatus?: string;
  tags?: string[];
  leadScore?: number;
}

interface KnowledgeContext {
  documents: Array<{ title: string; content: string; type: string }>;
}

interface BrandContext {
  businessName: string;
  toneInstructions?: string;
  customInstructions?: string;
  personality: string;
  cta?: { type: string; label: string; url: string };
}

export function buildSystemPrompt(
  brand: BrandContext,
  personality: string,
  knowledge: KnowledgeContext,
  semanticMemories?: string,
): string {
  const knowledgeSection = knowledge.documents.length > 0
    ? `\n\nUse this knowledge to answer questions:\n${knowledge.documents.map(d => `[${d.type.toUpperCase()}] ${d.title}:\n${d.content.slice(0, 1000)}`).join('\n\n')}`
    : '';

  const memorySection = semanticMemories ? `\n\nCustomer memory context:\n${semanticMemories}` : '';

  return `You are an AI sales assistant for ${brand.businessName}.
${brand.toneInstructions ? `\nTone: ${brand.toneInstructions}` : ''}
${brand.customInstructions ? `\nInstructions: ${brand.customInstructions}` : ''}

Personality: ${personality}

Rules:
1. Always be helpful and conversational
2. Use the provided knowledge to answer accurately
3. If you don't know, say so — never make up information
4. Qualify leads by asking relevant questions
5. When appropriate, offer the CTA: ${brand.cta ? `${brand.cta.label} - ${brand.cta.url}` : 'not configured'}
6. Never share internal business information
7. Log every lead detail you discover (name, email, phone, requirements)${knowledgeSection}${memorySection}`;
}

export function buildConversationContext(customer?: CustomerContext): string {
  if (!customer) return '';
  
  const parts: string[] = [];
  parts.push(`Customer: ${customer.name || customer.socialHandle}`);
  if (customer.relationshipStatus) parts.push(`Relationship: ${customer.relationshipStatus}`);
  if (customer.leadScore !== undefined) parts.push(`Lead Score: ${customer.leadScore}`);
  if (customer.tags?.length) parts.push(`Tags: ${customer.tags.join(', ')}`);
  if (customer.previousInteractions) {
    parts.push(`\nPrevious interactions:\n${customer.previousInteractions}`);
  }
  
  return parts.join('\n');
}
