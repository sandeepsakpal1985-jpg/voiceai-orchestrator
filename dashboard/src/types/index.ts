export type { User, Session } from "next-auth";

export type NavItem = {
  title: string;
  href: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
};

export type DashboardCard = {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: string;
  trend?: "up" | "down" | "neutral";
};

export type ChartDataPoint = {
  name: string;
  value: number;
  previous?: number;
  [key: string]: string | number | undefined;
};

export type CallMetric = {
  total: number;
  completed: number;
  failed: number;
  avgDuration: number;
  avgCost: number;
  totalCost: number;
  answerRate: number;
};

export type SentimentData = {
  label: string;
  value: number;
  color: string;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  apiCalls: number;
  callMinutes: number;
  teamSeats: number;
  features: string[];
  popular?: boolean;
};

export type CallRecord = {
  id: string;
  contactName: string;
  contactPhone: string;
  duration: number;
  status: string;
  direction: string;
  cost: number;
  sentiment: string;
  recordingUrl?: string;
  createdAt: string;
};

export type KnowledgeItem = {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  status: string;
  tags: string[];
  createdAt: string;
};

export type CampaignData = {
  id: string;
  name: string;
  status: string;
  totalCalls: number;
  completedCalls: number;
  successRate: number;
  createdAt: string;
};

export type VoiceOption = {
  id: string;
  name: string;
  language: string;
  gender: string;
  provider: string;
  preview?: string;
};

export type LanguageOption = {
  code: string;
  name: string;
  native: string;
};

export type CrmProvider = {
  id: string;
  name: string;
  logo: string;
  description: string;
  connected: boolean;
};

export type PromptItem = {
  id: string;
  name: string;
  category: string;
  content: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
};

export type BillingInfo = {
  plan: SubscriptionPlan;
  status: string;
  currentPeriodEnd: string;
  invoices: InvoiceRecord[];
  paymentMethod?: PaymentMethod;
};

export type InvoiceRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  invoiceUrl?: string;
  createdAt: string;
};

export type PaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

export type LiveCall = {
  id: string;
  contactName: string;
  contactPhone: string;
  duration: number;
  status: string;
  sentiment: string;
  transcription: string[];
  agentName: string;
  startedAt: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
