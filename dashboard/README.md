# VoiceAI Dashboard

Enterprise AI voice agent platform for intelligent call automation, analytics, and customer engagement.

**Stack:** Next.js 16.2 (App Router) · Prisma + PostgreSQL · NextAuth v5 · WebSocket (ws) · Tailwind CSS v4 · TypeScript 5

---

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env: set DATABASE_URL and AUTH_SECRET (required)

# 3. Database
npx prisma migrate deploy     # Apply migrations
npm run db:seed               # Seed demo data (2 users, 3 plans, 50 calls, etc.)

# 4. Start development
npm run dev:all               # Next.js (port 3000) + WS server (port 3001)

# 5. Open http://localhost:3000
# Login: demo@example.com / password123
# Admin: admin@example.com / password123
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Next.js)                  │
│  Dashboard · Analytics · Live Monitoring · Settings  │
├──────────────────────┬──────────────────────────────┤
│  Next.js HTTP Server │   WebSocket Client (WS)       │
│  (port 3000)         │   (connects to port 3001)     │
├──────────┬───────────┴──────────┬───────────────────┤
│  API      │  NextAuth (JWT)     │  WebSocket Server  │
│  Routes   │  · Credentials      │  (port 3001)       │
│  (28)     │  · Google OAuth     │  · JWT auth        │
│           │  · GitHub OAuth     │  · Channels         │
│           │                     │  · Broadcasting     │
├──────────┴─────────────────────┴───────────────────┤
│                  Prisma ORM                         │
├────────────────────────────────────────────────────┤
│               PostgreSQL Database                   │
└────────────────────────────────────────────────────┘
```

### Key Packages

| Category | Packages |
|----------|----------|
| **Framework** | Next.js 16.2, React 19, TypeScript 5 |
| **Database** | Prisma 7, PostgreSQL (pg) |
| **Auth** | NextAuth v5 (Credentials, Google, GitHub) |
| **UI** | Tailwind CSS v4, Radix UI, Lucide Icons, Recharts |
| **Real-time** | ws (WebSocket server + client) |
| **Rate Limiting** | In-memory (sliding window), Redis-backed with auto-fallback |
| **AI** | OpenAI client, browser SpeechRecognition/SpeechSynthesis |
| **Testing** | Vitest, Testing Library, jsdom |
| **Deploy** | Docker, docker-compose, Vercel |

---

## Features

### Communications
- **AI Agent** — Voice agent configuration with conversation management and LLM integration (OpenAI GPT-4o-mini, with graceful fallback to simulated responses)
- **Call Analytics** — Deep insights: call volume trends, hourly activity, duration/status distribution, cost analysis, tabbed views
- **Live Monitoring** — Real-time active calls with WebSocket-powered updates, live transcription preview, queue management, agent status
- **Realtime Dashboard** — Call flow visualization, agent status grid, active/queued count, alerts
- **Call History** — Searchable call records with status/sentiment badges, direction indicators, cost tracking
- **Call Recordings** — Recording management with playback

### AI & Content
- **Prompt Editor** — Manage AI agent prompts with versioning, categories, and variable substitution
- **Knowledge Base** — Upload and manage documents for AI agent context
- **Voice Selection** — Configure voice settings (provider, speaking rate, pitch, emotion)
- **Multilingual** — Language configuration with auto-detection and translation provider

### Operations
- **Campaign Manager** — Create and manage outbound call campaigns with progress tracking
- **Sentiment Analytics** — Emotional analysis with trend charts, distribution pie, alerts
- **CRM Integration** — Connect Salesforce, HubSpot, Zoho, Pipedrive, Dynamics
- **Monitoring** — System health dashboard with request metrics, route analysis, duration distribution, structured logs, memory usage

### Infrastructure
- **Rate Limiting** — IP-based sliding window with per-route configs (auth: 10/min, webhooks: 200/min, API: 60/min, etc.), Redis support with automatic in-memory fallback
- **Health Checks** — Aggregated `/api/health` endpoint checking DB, WebSocket, Redis, and rate limiter; brief mode for load balancers
- **Error Boundaries** — React error boundary with retry capability for graceful error recovery
- **Security** — HTTP security headers (X-Frame-Options, CSP, etc.), rate-limited API routes, JWT-based WebSocket auth

---

## API Routes (28 Total)

All API routes require authentication (except `/auth/*`, `/webhooks/twilio/*`).

### Auth
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers (credentials, OAuth) |
| `/api/auth/register` | POST | User registration |

### Communications
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/analytics` | GET | Call analytics with daily trends, duration/status distribution |
| `/api/calls` | GET | Paginated call history with search |
| `/api/recordings` | GET | Recording list with metadata |
| `/api/live-monitoring` | GET | Active calls, queue, agent stats |
| `/api/realtime-dashboard` | GET | Real-time dashboard data |

### AI & Content
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/ai/complete` | POST | LLM text completion |
| `/api/agent/call` | GET, POST, PUT | Voice agent call management |
| `/api/agent/stream` | GET | Streaming agent responses (SSE) |
| `/api/prompts` | GET, POST | Prompt CRUD |
| `/api/knowledge-base` | GET | Knowledge documents |
| `/api/voices` | GET, PUT | Voice settings |
| `/api/multilingual` | GET, PUT | Language configuration |

### Operations
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/campaigns` | GET, POST | Campaign CRUD |
| `/api/sentiment` | GET | Sentiment analytics |
| `/api/crm` | GET | CRM connections |
| `/api/monitoring` | GET, POST | System metrics and logging |

### Infrastructure
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check (DB, WS, Redis, rate limiter) |
| `/api/ws-token` | GET | WebSocket JWT token generation |
| `/api/settings` | GET, PUT | User settings/profile |
| `/api/subscriptions` | GET | User subscription |
| `/api/subscriptions/plans` | GET | Available plans |
| `/api/billing/invoices` | GET | Billing invoices |

### Webhooks
| Route | Description |
|-------|-------------|
| `/api/webhooks/twilio` | Twilio inbound call handler |
| `/api/webhooks/twilio/status` | Twilio call status callbacks |
| `/api/webhooks/twilio/voice` | Twilio voice redirect |
| `/api/webhooks/twilio/gather` | Twilio gather (DTMF/speech input) |

---

## Database Schema (15 Models)

```
User → Account, Session, ApiKey, CallLog, Prompt, KnowledgeDocument,
     → CrmConnection, Campaign, VoiceSettings, MultilingualConfig,
     → Subscription → Plan, BillingInvoice, SentimentAnalytic
```

---

## Deployment

### Option 1: Docker (Recommended)

```bash
# Full stack: Next.js + WS server + PostgreSQL
docker compose up -d

# Or build and run individually:
docker build -t voiceai-dashboard .
docker run -p 3000:3000 voiceai-dashboard
```

### Option 2: Manual

```bash
npm run build
npm start            # Next.js on port 3000
npm run start:ws     # WS server on port 3001 (separate terminal)
```

### Option 3: Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push to GitHub
2. Import to Vercel
3. Set environment variables (DATABASE_URL, AUTH_SECRET, etc.)
4. Deploy (WebSocket server runs separately)

### CI/CD

GitHub Actions workflows included:
- **CI** (`.github/workflows/ci.yml`) — TypeScript typecheck → ESLint → Vitest → Next.js build (on push/PR to main)
- **Deploy** (`.github/workflows/deploy.yml`) — Auto-deploy to Vercel on push to main

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `AUTH_SECRET` | ✅ | — | JWT encryption secret (`openssl rand -base64 32`) |
| `AUTH_URL` | — | `http://localhost:3000` | Public app URL (NextAuth callbacks) |
| `OPENAI_API_KEY` | — | — | OpenAI key (falls back to simulated responses) |
| `NEXT_PUBLIC_BASE_URL` | — | — | Public URL for Twilio callbacks |
| `TWILIO_ACCOUNT_SID` | — | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | — | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | — | — | Twilio phone number |
| `NEXT_PUBLIC_WS_URL` | — | `ws://localhost:3001` | WebSocket server URL |
| `REDIS_URL` | — | — | Redis URL for distributed rate limiting |

---

## Testing

```bash
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run typecheck     # TypeScript type checking
```

**Test coverage:** 10 test files, 131+ tests covering:
- Rate limiting (in-memory + Redis fallback)
- Middleware (config matcher, 429 responses, IP extraction, route configs)
- API routes (live-monitoring, realtime-dashboard, auth)
- WebSocket server (connect, auth, channels, metrics)
- React components (stats-card, error-boundary)
- Hooks (use-api)
- Utilities

---

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login, Register
│   │   ├── (dashboard)/       # All dashboard pages (17 pages)
│   │   └── api/               # API routes (28 endpoints)
│   ├── components/
│   │   ├── charts/            # Area, Bar, Pie chart components
│   │   ├── dashboard/         # Sidebar, Navbar, StatsCard
│   │   └── ui/                # shadcn-style primitives (button, card, etc.)
│   ├── hooks/                 # use-api, use-websocket
│   ├── lib/
│   │   ├── ai/                # Agent, conversation, LLM, STT, TTS
│   │   ├── auth.ts            # NextAuth configuration
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── monitoring.ts      # In-process metrics and logging
│   │   ├── queries.ts         # Database query helpers
│   │   ├── rate-limiter.ts    # In-memory sliding window rate limiter
│   │   ├── rate-limiter-redis.ts # Redis-backed rate limiter
│   │   ├── ws-auth.ts         # WebSocket JWT utilities
│   │   └── utils.ts           # Shared utilities
│   ├── generated/prisma/      # Generated Prisma client
│   └── __tests__/             # Tests (10 test files)
├── server/
│   └── ws-server.ts           # WebSocket server (auth, channels, metrics)
├── prisma/
│   ├── schema.prisma          # 15 models
│   ├── seed.ts                # Demo data seeder
│   └── migrations/            # Database migrations
├── .github/workflows/         # CI + Deploy pipelines
├── Dockerfile                 # Next.js Docker image
├── Dockerfile.ws              # WebSocket server Docker image
├── docker-compose.yml         # Full stack (Postgres + app + WS)
└── vercel.json                # Vercel deployment config
```
