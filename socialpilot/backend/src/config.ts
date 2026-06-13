import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

/**
 * Required environment variables for production.
 * Startup validation ensures these are set before the app starts.
 */
const REQUIRED_ENV_VARS: Array<{ key: string; label: string; when?: () => boolean }> = [
  { key: 'DATABASE_URL', label: 'PostgreSQL connection string' },
  { key: 'REDIS_URL', label: 'Redis connection string' },
  { key: 'JWT_SECRET', label: 'JWT signing secret' },
  { key: 'META_APP_ID', label: 'Meta App ID (for Instagram/Facebook OAuth)' },
  { key: 'META_APP_SECRET', label: 'Meta App Secret' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API key (for AI replies)' },
];

/**
 * Validate required environment variables at startup.
 * In production, missing required vars cause a hard stop.
 * In development, they log warnings.
 */
export function validateEnv(): void {
  const missing: string[] = [];
  for (const v of REQUIRED_ENV_VARS) {
    if (!process.env[v.key]) {
      missing.push(`${v.key} — ${v.label}`);
    }
  }

  if (missing.length > 0) {
    const isProd = (process.env.NODE_ENV || 'development') === 'production';
    const message = `\n⚠️  Missing required environment variables:\n${missing.map(m => `  • ${m}`).join('\n')}\n`;

    if (isProd) {
      console.error(message);
      console.error('❌ Cannot start MetaPilot AI in production — set these variables and restart.');
      process.exit(1);
    } else {
      console.warn(message);
      console.warn('⚠️  Starting in development mode — some features may not work.');
    }
  }
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/socialpilot',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
  },
  
  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'metapilot_verify_123',
    callbackUrl: process.env.META_CALLBACK_URL || 'http://localhost:4000/api/meta/callback',
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || '',
  },
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'socialpilot',
  },
  
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  },

  posthog: {
    apiKey: process.env.POSTHOG_API_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || '',
    host: process.env.POSTHOG_HOST || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  },

  queue: {
    commentDelayMin: parseInt(process.env.COMMENT_QUEUE_DELAY_MIN || '45000', 10),
    commentDelayMax: parseInt(process.env.COMMENT_QUEUE_DELAY_MAX || '90000', 10),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

export type Config = typeof config;
