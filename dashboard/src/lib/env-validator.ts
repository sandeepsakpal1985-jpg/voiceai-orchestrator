/**
 * VoiceAI Dashboard — Environment Variable Validator
 *
 * Validates required environment variables at startup and provides
 * clear error messages for missing configuration.
 */

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
  secret: boolean;
}

const ENV_VARS: EnvVar[] = [
  // Database
  { key: "DATABASE_URL", required: true, description: "PostgreSQL connection string for Prisma", secret: true },

  // Auth
  { key: "AUTH_SECRET", required: true, description: "NextAuth.js encryption secret (generate with `openssl rand -base64 32`)", secret: true },
  { key: "AUTH_URL", required: false, description: "Full URL of the deployed app (e.g., https://app.voiceai.com)", secret: false },

  // OAuth providers (optional — feature-gated)
  { key: "AUTH_GOOGLE_ID", required: false, description: "Google OAuth 2.0 client ID for social login", secret: true },
  { key: "AUTH_GOOGLE_SECRET", required: false, description: "Google OAuth 2.0 client secret", secret: true },
  { key: "AUTH_GITHUB_ID", required: false, description: "GitHub OAuth app client ID", secret: true },
  { key: "AUTH_GITHUB_SECRET", required: false, description: "GitHub OAuth app client secret", secret: true },

  // Redis (optional — falls back to in-memory)
  { key: "REDIS_URL", required: false, description: "Redis connection string for distributed rate limiting", secret: true },

  // AI services (optional — falls back to simulated responses)
  { key: "OPENAI_API_KEY", required: false, description: "OpenAI API key for LLM call handling", secret: true },
  { key: "ELEVENLABS_API_KEY", required: false, description: "ElevenLabs API key for TTS voice synthesis", secret: true },
  { key: "DEEPGRAM_API_KEY", required: false, description: "Deepgram API key for STT transcription", secret: true },

  // Twilio (optional — call functionality without it won't connect real calls)
  { key: "TWILIO_ACCOUNT_SID", required: false, description: "Twilio account SID for PSTN/SIP calling", secret: true },
  { key: "TWILIO_AUTH_TOKEN", required: false, description: "Twilio auth token", secret: true },
  { key: "TWILIO_PHONE_NUMBER", required: false, description: "Twilio phone number for outbound calls", secret: false },

  // Stripe (optional — subscriptions work with mock data)
  { key: "STRIPE_SECRET_KEY", required: false, description: "Stripe secret key for payment processing", secret: true },
  { key: "STRIPE_WEBHOOK_SECRET", required: false, description: "Stripe webhook signing secret", secret: true },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", required: false, description: "Stripe publishable key (client-side)", secret: false },

  // WebSocket server
  { key: "WS_URL", required: false, description: "WebSocket server URL (default: http://localhost:3001)", secret: false },
];

interface ValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  warnings: string[];
}

/**
 * Validates environment variables and returns a structured result.
 * Does not throw — use checkEnvVars() for startup validation.
 */
export function validateEnvVars(): ValidationResult {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];

    if (!value || value.trim() === "") {
      if (envVar.required) {
        missingRequired.push(`${envVar.key} — ${envVar.description}`);
      } else {
        missingOptional.push(`${envVar.key} — ${envVar.description}`);
      }
    } else if (envVar.secret && (value.startsWith("http") || value.length < 8)) {
      // Warn if a secret looks like a URL or is suspiciously short
      warnings.push(`${envVar.key} appears to be a placeholder or URL, not a real secret key`);
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    warnings,
  };
}

/**
 * Validates environment and logs results. Returns true if all required vars are present.
 * Call this once at application startup from instrumentation.ts or layout.ts.
 */
export function checkEnvVars(): boolean {
  if (process.env.NODE_ENV === "development") {
    return true; // Skip strict checks in dev mode
  }

  const result = validateEnvVars();

  if (result.missingRequired.length > 0) {
    console.error("❌ Missing required environment variables:");
    for (const msg of result.missingRequired) {
      console.error(`   • ${msg}`);
    }
    console.error("\nSet these in your .env file or deployment environment before starting.");
  }

  if (result.missingOptional.length > 0) {
    console.warn("⚠️  Missing optional environment variables (features will be degraded):");
    for (const msg of result.missingOptional) {
      console.warn(`   • ${msg}`);
    }
  }

  if (result.warnings.length > 0) {
    console.warn("⚠️  Environment variable warnings:");
    for (const msg of result.warnings) {
      console.warn(`   • ${msg}`);
    }
  }

  if (result.valid) {
    const totalConfigured = ENV_VARS.filter(
      (v) => process.env[v.key] && process.env[v.key]!.trim() !== ""
    ).length;
    console.info(`✅ Environment: ${totalConfigured}/${ENV_VARS.length} variables configured`);
  }

  return result.valid;
}
