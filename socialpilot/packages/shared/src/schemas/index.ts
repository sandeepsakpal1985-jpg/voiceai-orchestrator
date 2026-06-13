import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const leadUpdateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  requirement: z.string().optional(),
  budget: z.string().optional(),
  category: z.enum(['cold', 'warm', 'hot', 'vip']).optional(),
  tags: z.array(z.string()).optional(),
});

export const crmStageSchema = z.object({
  stage: z.enum(['new_lead', 'contacted', 'qualified', 'demo_scheduled', 'proposal_sent', 'negotiation', 'won', 'lost']),
});

export const knowledgeCreateSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['faq', 'product', 'pricing', 'policy', 'script']),
  content: z.string().min(1),
});

export const onboardingStepSchema = z.object({
  step: z.enum([
    'create_account', 'connect_instagram', 'connect_facebook',
    'upload_faqs', 'add_cta', 'choose_personality', 'turn_on_automation',
  ]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
