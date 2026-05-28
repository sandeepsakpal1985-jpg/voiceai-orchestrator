# AI Voice Agent — Setup Requirements Guide

## Prerequisites & Setup Order

Follow these steps **in order** — each step depends on the previous one.

---

## Step 1: Git (Save Progress)

```bash
git add -A
git commit -m "Add tests, fix auth middleware, polish dashboard"
```

---

## Step 2: Postgres Database (Required — Free)

**Service:** [Neon](https://neon.tech) (free tier: 0.5 GB storage)

**What to do:**
1. Go to https://neon.tech
2. Sign up with GitHub
3. Create a new project
4. Copy the connection string (starts with `postgresql://...`)

**Will set as:** `DATABASE_URL` in `.env`

---

## Step 3: LiveKit (Required — Free tier or Self-hosted)

**Option A — LiveKit Cloud (easier):**
1. Go to https://cloud.livekit.io
2. Sign up → Create a project
3. Get your credentials:
   - `LIVEKIT_URL` (e.g., `wss://your-project.livekit.cloud`)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`

**Option B — Self-hosted (free):**
- I can set up the LiveKit server via Docker on your VPS
- No API keys needed from you

---

## Step 4: OpenAI API Key (Required)

**Service:** [OpenAI Platform](https://platform.openai.com)

**What to do:**
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-...`)

**Will set as:** `OPENAI_API_KEY` in `.env`

Used for: GPT-4o conversational AI (LLM backbone)

---

## Step 5: Speech-to-Text Provider (Recommended — Free tier)

**Pick one:**

### Deepgram (Recommended)
- https://console.deepgram.com
- $200 free credit (no credit card needed)
- **Will set as:** `DEEPGRAM_API_KEY`

### AssemblyAI (Alternative)
- https://www.assemblyai.com
- Free tier available
- **Will set as:** `ASSEMBLYAI_API_KEY`

---

## Step 6: Text-to-Speech Provider (Recommended — Free tier)

**Pick one:**

### ElevenLabs (Recommended)
- https://elevenlabs.io
- 10,000 free characters/month (no credit card)
- **Will set as:** `ELEVENLABS_API_KEY`

### Azure Speech (Alternative)
- https://azure.microsoft.com/en-us/products/ai-services/ai-speech
- Free tier: 0.5 million characters/month
- **Will set as:** `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`

### Other options: PlayAI, Cartesia

---

## Step 7: Email Service (Optional — Free tier)

**Pick one:**

### SendGrid
- https://sendgrid.com
- Free: 100 emails/day
- **Will set as:** `SENDGRID_API_KEY` + verified sender email

### Resend
- https://resend.com
- Free: 100 emails/day
- **Will set as:** `RESEND_API_KEY` + verified domain

Used for: Email verification, password reset, notifications

---

## Step 8: Deploy to Production

With all credentials in place, I will:
1. Build Docker images
2. Configure docker-compose for production
3. Set up your VPS (Hetzner / RunPod / OVH recommended)
4. Configure Nginx, SSL certificates (Let's Encrypt)
5. Set up monitoring & health checks
6. Validate end-to-end voice pipeline

---

## Estimated Costs (All Free Tiers)

| Service    | Cost    | Limits                        |
|------------|---------|-------------------------------|
| Neon       | Free    | 0.5 GB storage, shared CPU    |
| LiveKit    | Free    | 10 concurrent rooms           |
| OpenAI     | Pay-go  | ~$2-5/month for light use     |
| Deepgram   | Free    | $200 credit                   |
| ElevenLabs | Free    | 10k chars/month               |
| SendGrid   | Free    | 100 emails/day                |
| **Total**  | **~$0-5/month** |                          |

---

## Quick Reference: All Environment Variables

```
# Required
DATABASE_URL=postgresql://...
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
OPENAI_API_KEY=sk-...
AUTH_URL=http://localhost:3000     # Change in production

# Speech-to-Text (pick one)
DEEPGRAM_API_KEY=...
# or
ASSEMBLYAI_API_KEY=...

# Text-to-Speech (pick one)
ELEVENLABS_API_KEY=...
# or
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=...

# Email (optional)
SENDGRID_API_KEY=...
# or
RESEND_API_KEY=...

# Optional
REDIS_URL=redis://...             # For caching/rate limiting
SENTRY_DSN=...                    # Error tracking
```
