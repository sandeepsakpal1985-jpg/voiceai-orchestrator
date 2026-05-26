# VoiceAI Orchestrator — Architecture Guide

> **Production-grade, multi-provider AI voice orchestration platform.**
> Switch between local and cloud AI providers without code changes.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [System Components](#2-system-components)
3. [Request Flow](#3-request-flows)
4. [Provider System](#4-provider-system)
5. [Data Model](#5-data-model)
6. [Infrastructure](#6-infrastructure)
7. [Security Model](#7-security-model)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [Deployment Architecture](#9-deployment-architecture)

---

## 1. High-Level Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Dashboard  │────▶│  FastAPI Backend  │────▶│   Providers   │
│  (Next.js 15)│     │  (Python 3.12)   │     │  STT/LLM/TTS  │
│              │◀────│  Port 8000       │◀────│               │
└──────────────┘     └────────┬─────────┘     └───────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌──────────┐   ┌────────────┐   ┌──────────┐
       │ LiveKit  │   │  ChromaDB  │   │ Postgres │
       │ (Realtime│   │  (Vector   │   │ (Auth +  │
       │  Voice)  │   │   Store)   │   │  CRM)    │
       └──────────┘   └────────────┘   └──────────┘
              │
              ▼
       ┌──────────────┐
       │ Twilio SIP   │
       │ Trunk → PSTN │
       └──────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Provider-agnostic core** | Switch between local/cloud AI without code changes |
| **Local-first defaults** | Whisper → Ollama → Kokoro = zero cloud dependency |
| **LiveKit for realtime** | WebRTC transport with SIP/PSTN bridging |
| **FastAPI async** | Full async I/O for concurrent voice sessions |
| **Python 3.12** | Pattern matching, improved async, performance |

---

## 2. System Components

### 2.1 Backend (`app/`)

```
app/
├── main.py                 # FastAPI app entry, provider registration
├── config.py               # Environment-driven settings
├── routers/                # API route handlers
│   ├── health.py           # GET /health, GET /providers
│   ├── conversations.py    # CRUD conversations
│   ├── voice.py            # Audio pipeline, intent detection
│   ├── calls.py            # Outbound call management
│   ├── ws_voice.py         # WebSocket voice streaming
│   ├── twilio_webhooks.py  # Twilio voice/SMS webhooks
│   ├── agents.py           # Agent configuration CRUD
│   ├── knowledge.py        # Knowledge base file upload + search
│   ├── social.py           # Social platform connections
│   ├── sip.py              # SIP call status + config
│   ├── runtime.py          # Runtime/profiling endpoints
│   ├── voice_profiles.py   # Voice cloning profile CRUD
│   └── monitoring.py       # /metrics, /health/deep, /logs/recent
├── providers/              # Pluggable AI provider implementations
│   ├── base.py             # Abstract base classes + registry
│   ├── gpu.py              # GPU auto-detection utility
│   ├── stt/                # Speech-to-Text (Whisper, Deepgram)
│   ├── llm/                # LLM (Ollama, OpenAI, Gemini, OpenRouter)
│   ├── tts/                # TTS (Kokoro, OpenVoice, XTTS, ElevenLabs)
│   ├── memory/             # Vector store (ChromaDB) + embeddings
│   └── social/             # Social (Instagram, Facebook, WhatsApp)
├── services/               # Business logic
│   ├── conversation.py     # Conversation lifecycle management
│   ├── adaptive_conversation.py  # Emotional state machine
│   ├── intent.py           # Speech intent classification
│   ├── rag.py              # Retrieval-augmented generation
│   └── persistence.py      # Redis/in-memory persistence layer
├── middleware/              # HTTP middleware
│   ├── auth.py             # JWT Bearer token validation
│   ├── rate_limit.py       # Token bucket rate limiting
│   └── subscription.py     # Multi-tenant plan enforcement
├── advanced/               # Advanced conversation features
│   ├── state_engine.py     # Finite state machine for conversations
│   ├── interrupt_detector.py  # Real-time barge-in detection
│   ├── adaptive_playback.py   # Dynamic pacing engine
│   ├── conversation_analyzer.py  # Semantic intent classification
│   └── orchestrator.py     # Advanced pipeline orchestrator
├── livekit/                # LiveKit realtime voice runtime
│   ├── room_manager.py     # Room lifecycle management
│   ├── agent_worker.py     # Voice pipeline agent (STT→LLM→TTS)
│   ├── audio_bridge.py     # LiveKit frame ↔ PCM byte conversion
│   ├── sip_dispatch.py     # Inbound SIP call routing
│   └── worker_server.py    # Worker health + session API
├── tools/                  # Tool registry (MCP-style)
│   ├── base.py             # ToolDefinition, ToolRegistry
│   ├── crm_tools.py        # CRM lookup, history, notes
│   └── rag_tool.py         # Knowledge base search tool
├── models/                 # Pydantic schemas
│   └── schemas.py          # Request/response models
└── voice/                  # Legacy voice pipeline (deprecated)
    └── pipeline.py
```

### 2.2 Dashboard (`dashboard/`)

```
dashboard/
├── src/
│   ├── app/                          # Next.js 15 App Router
│   │   ├── (dashboard)/              # Authenticated routes
│   │   │   ├── page.tsx              # Home / stats overview
│   │   │   ├── agents/               # Agent configuration
│   │   │   ├── calls/                # Call logs + live calls
│   │   │   ├── conversations/        # Conversation history
│   │   │   ├── knowledge-base/       # RAG document management
│   │   │   ├── live-monitoring/      # Real-time agent monitor
│   │   │   ├── realtime-dashboard/   # LiveKit dashboard
│   │   │   ├── settings/             # Settings pages
│   │   │   ├── social/               # Social media connections
│   │   │   ├── voice-chat/           # Voice chat demo
│   │   │   ├── voice-cloning/        # Voice profile management
│   │   │   └── voices/               # TTS voice selection
│   │   ├── (auth)/                   # Login/Register
│   │   ├── api/                      # API routes (BFF proxy)
│   │   └── layout.tsx                # Root layout
│   ├── components/                   # Reusable UI components
│   ├── hooks/                        # React hooks
│   │   ├── use-api.ts                # API client with auth
│   │   └── use-websocket.ts          # WebSocket with JWT auth
│   ├── lib/                          # Utilities
│   │   ├── auth.ts                   # NextAuth configuration
│   │   ├── ws-auth.ts                # WebSocket JWT utilities
│   │   └── queries.ts                # Server actions
│   └── types/                        # TypeScript types
├── server/                           # WebSocket server (Node.js)
│   └── ws-server.ts                  # Real-time event bridge
├── prisma/                           # Database schema
│   ├── schema.prisma                 # User, Agent, Campaign models
│   └── seed.ts                       # Development seed data
└── playwright.config.ts              # E2E test config
```

---

## 3. Request Flows

### 3.1 Voice Call Flow (Browser → LiveKit)

```
Browser                Dashboard            FastAPI              LiveKit             Provider
   │                      │                   │                    │                    │
   │── request token ────▶│                   │                    │                    │
   │                      │── create room ───▶│── create room ────▶│                    │
   │                      │                   │◀─ room info ───────│                    │
   │◀── token + URL ──────│                   │                    │                    │
   │                      │                   │                    │                    │
   │── join room ────────────────────────────────────────────────▶│                    │
   │                      │                   │                    │                    │
   │                      │                   │                    │── agent joins ──▶  │
   │                      │                   │                    │                    │
   │── audio stream ────────────────────────────────────────────▶│                    │
   │                      │                   │                    │── STT ────────────▶│
   │                      │                   │                    │◀─ text ────────────│
   │                      │                   │                    │── LLM ────────────▶│
   │                      │                   │                    │◀─ response ────────│
   │                      │                   │                    │── TTS ────────────▶│
   │◀─ audio stream ─────────────────────────────────────────────│◀─ audio ────────────│
   │                      │                   │                    │                    │
```

### 3.2 Phone Call Flow (PSTN → Twilio → SIP → LiveKit)

```
Caller            Twilio           LiveKit SIP        FastAPI          Agent Worker
  │                 │                   │                │                   │
  │── dial number ─▶│                   │                │                   │
  │                 │── INVITE ────────▶│                │                   │
  │                 │                   │── dispatch ───▶│                   │
  │                 │                   │                │── create room ──▶│
  │                 │                   │◀── room ok ────│                   │
  │                 │◀── 200 OK ────────│                │                   │
  │◀── connected ───│                   │                │                   │
  │                 │                   │                │                   │
  │── audio RTP ────│── SIP RTP ──────▶│── WebRTC ──────│──── STT ─────────▶│
  │                 │                   │                │──── LLM ─────────▶│
  │                 │                   │                │──── TTS ─────────▶│
  │◀─ audio RTP ────│◀─ SIP RTP ───────│◀─ WebRTC ──────│◀── audio ────────│
```

### 3.3 API Request Flow (Auth + Rate Limit)

```
Client                  AuthMiddleware         RateLimitMiddleware       Router
  │                         │                        │                    │
  │── POST /conversations ─▶│                        │                    │
  │   Authorization: Bearer │                        │                    │
  │                         │── verify JWT ──────▶   │                    │
  │                         │◀── payload ──────────  │                    │
  │                         │── check rate limit ──▶ │                    │
  │                         │◀── allowed ─────────── │                    │
  │                         │── set state.user ────▶ │── forward ───────▶│
  │                         │                        │                    │
  │◀── 200 OK ──────────────│                        │◀── response ──────│
```

---

## 4. Provider System

### 4.1 Provider Registry

The `ProviderRegistry` (singleton) manages all AI providers:

```python
registry = get_default_registry()
registry.register_stt("whisper", WhisperSTTProvider(...))
registry.register_llm("ollama", OllamaLLMProvider(...))
registry.register_tts("kokoro", KokoroTTSProvider(...))
```

**Registration priority:** Local-first — cloud providers are only registered if API keys are configured.

### 4.2 Current Providers

| Category | Provider | Type | Default | GPU | Notes |
|----------|----------|------|---------|-----|-------|
| **STT** | Whisper (faster-whisper) | Local | ✅ Yes | ✅ CUDA/CPU | Auto model size by VRAM |
| **STT** | Deepgram | Cloud | No | N/A | Requires API key |
| **LLM** | Ollama (Qwen 2.5) | Local | ✅ Yes | ✅ CUDA/CPU | 7B default, switch model by env |
| **LLM** | OpenAI (GPT-4o) | Cloud | No | N/A | Requires API key |
| **LLM** | Gemini 2.0 Flash | Cloud | No | N/A | Requires API key |
| **LLM** | OpenRouter | Cloud | No | N/A | Multi-model access |
| **TTS** | Kokoro | Local | ✅ Yes | CPU-only | ~82M params, ~500ms/first-chunk |
| **TTS** | OpenVoice v2 | Local | No | ✅ CUDA/CPU | Voice cloning |
| **TTS** | XTTS-v2 (Coqui) | Local | No | ✅ CUDA/CPU | Multi-language, ~1.8GB |
| **TTS** | Qwen3-TTS | Local | No | ✅ CUDA/CPU | Multimodal TTS |
| **TTS** | ElevenLabs | Cloud | No | N/A | Requires API key |
| **Memory** | ChromaDB | Local | ✅ Yes | N/A | Vector store |
| **Embed** | SentenceTransformers | Local | ✅ Yes | ✅ CUDA/CPU | all-MiniLM-L6-v2 |

### 4.3 GPU Auto-Detection

On startup, `detect_gpu_config()` probes `torch.cuda` and selects optimal settings:

| VRAM | Recommended Model | Compute Type | Use Case |
|------|-------------------|--------------|----------|
| 0 GB (CPU) | tiny | int8 | Development |
| 1–2 GB | base | int8 | Low-end GPU |
| 2–4 GB | small | int8 | Entry GPU |
| 4–6 GB | medium | float16 | Mid-range |
| 6–10 GB | large-v3 | float16 | Good GPU |
| 10+ GB | large-v3 | float16 | High-end |

---

## 5. Data Model

### 5.1 Database (PostgreSQL via Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  agents    Agent[]
  sessions  Session[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Agent {
  id            String    @id @default(cuid())
  name          String
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  sttProvider   String    @default("whisper")
  llmProvider   String    @default("ollama")
  ttsProvider   String    @default("kokoro")
  voiceId       String?
  systemPrompt  String?
  tools         Json?
  campaigns     Campaign[]
  conversations Conversation[]
}

model Campaign {
  id          String   @id @default(cuid())
  name        String
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id])
  script      String?
  contacts    Json?
  calls       Call[]
}

model Conversation {
  id          String    @id @default(cuid())
  agentId     String?
  agent       Agent?    @relation(fields: [agentId], references: [id])
  campaignId  String?
  messages    Message[]
  calls       Call[]
}

model Call {
  id             String   @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  campaignId     String?
  toNumber       String
  status         CallStatus @default(PENDING)
  duration       Int?
  recordingUrl   String?
}
```

### 5.2 In-Memory State (for Redis-backed persistence)

The following data is stored in-memory with optional Redis persistence:

| Data | Key Pattern | Redis | Expiry |
|------|-------------|-------|--------|
| Active SIP calls | `voiceai:sip:{call_id}` | ✅ HSET | 24h |
| Usage tracking | `voiceai:usage:{key}` | ✅ ZSET | 2h |
| Voice profiles | `voiceai:vp:{profile_id}` | ✅ HSET | 7d |
| Rate limit state | `voiceai:ratelimit:{ip}:{path}` | ✅ via middleware | Window |
| Social connections | In-memory dict | ❌ | Session |
| Conversations | In-memory dict | ❌ | Session |

---

## 6. Infrastructure

### 6.1 Docker Services

```
docker-compose.yml
├── voiceai-api          # FastAPI backend (REST API)
├── voiceai-worker       # LiveKit agent worker (WebRTC)
├── ollama               # Local LLM server
├── chromadb             # Vector store
├── postgres             # Auth + CRM data
├── livekit-server       # WebRTC server
├── redis                # Rate limiting + persistence (optional)
└── dashboard            # Next.js frontend (optional)
```

### 6.2 GPU Runtime (Dockerfile)

Multi-stage Dockerfile with `gpu-runtime` target:
- **Base:** Python 3.12-slim, production dependencies
- **GPU:** CUDA 12.4 PyTorch, `torch.cuda.is_available()` checks
- CPU/GPU selection via `docker compose --profile gpu up -d`

### 6.3 CI/CD Pipeline

```
backend-ci.yml
├── lint-and-test        # flake8 + 326 pytest tests
├── e2e-smoke            # Docker compose + SIP smoke test (main only)

dashboard-ci.yml         # Lint → test → build → deploy
└── deploy.yml           # Vercel deployment (main branch)
```

---

## 7. Security Model

### 7.1 Authentication

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| Dashboard | NextAuth (Credentials + JWT) | Browser users |
| Backend API | JWT Bearer token (HS256) | All REST endpoints |
| WebSocket | Short-lived JWT (5 min) | Real-time voice |
| Excluded paths | `/health`, `/docs`, `/openapi.json`, `/twilio/*`, `/runtime/*` | Public |

### 7.2 Middleware Stack (order matters)

```
1. CORSMiddleware          → Allow dashboard origins
2. RateLimitMiddleware     → Token bucket per IP (100 req/60s)
3. AuthMiddleware          → JWT validation (← excludes public paths)
4. SubscriptionEnforcement → Plan limits (optional, opt-in)
5. Global Exception Handler → Structured error responses
```

### 7.3 Rate Limiting

- **Algorithm:** Token bucket (sliding window)
- **Limit:** 100 requests / 60 seconds (configurable)
- **Backend:** Redis (distributed) or in-memory (single worker)
- **Excluded:** health, docs, Twilio webhooks
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

---

## 8. Monitoring & Observability

### 8.1 Metrics Endpoint (`GET /metrics`)

Prometheus-formatted metrics:

```
# HELP voiceai_uptime_seconds Application uptime
# TYPE voiceai_uptime_seconds gauge
voiceai_uptime_seconds 12345.6

# HELP voiceai_http_requests_total Total HTTP requests
# TYPE voiceai_http_requests_total counter
voiceai_http_requests_total{method="GET",path="/health",status="200"} 42

# HELP voiceai_ws_connections_active Active WebSocket connections
# TYPE voiceai_ws_connections_active gauge
voiceai_ws_connections_active 3

# HELP voiceai_gpu_available GPU availability
# TYPE voiceai_gpu_available gauge
voiceai_gpu_available 1
voiceai_gpu_device_count 1
```

### 8.2 Health Checks

| Endpoint | Type | Purpose |
|----------|------|---------|
| `GET /health` | Basic | Load balancer health check |
| `GET /health/deep` | Deep | Checks Postgres, ChromaDB, LiveKit, Ollama |
| `GET /health/readiness` | K8s | Ready to serve traffic |
| `GET /health/liveness` | K8s | Process alive |

### 8.3 Logging

- **Structured logging** with timestamps and correlation IDs
- **Ring buffer:** Last 200 log entries at `GET /logs/recent`
- **Levels:** DEBUG in dev, INFO in production

---

## 9. Deployment Architecture

### 9.1 Single Server (Hetzner CX52 / OVH)

```
Docker Compose (all services)
├── voiceai-api + worker (CPU or GPU)
├── ollama (CPU or GPU)
├── postgres + chromadb
└── livekit-server
```

**Cost:** ~€45-120/month
**Capacity:** ~50 concurrent calls
**GPU:** RTX 4090 (24GB) or RTX 6000 Ada (48GB)

### 9.2 Production (Hetzner + RunPod)

```
Hetzner Cloud                    RunPod
├── voiceai-api                  ├── ollama (GPU)
├── postgres + chromadb          ├── livekit-server (GPU)
├── redis                        └── voiceai-worker (GPU)
└── dashboard
```

**Cost:** ~€100-300/month
**Capacity:** ~200 concurrent calls
**Latency:** LLM <200ms, TTS <500ms

### 9.3 Environment Variables

See [`.env.example`](.env.example) for all configurable settings.

**Required:**
- `AUTH_SECRET` — JWT signing key (generate with `openssl rand -base64 32`)
- `DATABASE_URL` — PostgreSQL connection string

**Provider-specific:**
- `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp API
- `OPENAI_API_KEY` — OpenAI (optional)
- `GEMINI_API_KEY` — Gemini (optional)
- `ELEVENLABS_API_KEY` — ElevenLabs (optional)
- `DEEPGRAM_API_KEY` — Deepgram (optional)

---

## 10. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| STT latency (Whisper) | <500ms for 5s audio | First token time |
| LLM first token | <300ms (Ollama 7B) | Time to first token |
| LLM throughput | >50 tokens/s (Ollama 7B on GPU) | Tokens per second |
| TTS first chunk (Kokoro) | <100ms | Time to first audio chunk |
| TTS (XTTS on GPU) | <300ms for 10s audio | End-to-end latency |
| API response (p95) | <200ms | HTTP request duration |
| Voice call E2E | <2s (STT+LLM+TTS) | Round-trip audio |
| Concurrent calls | 50-100 (single GPU) | Active sessions |
| Uptime | 99.9% | Health check success rate |

---

## 11. Development

```bash
# Setup
git clone https://github.com/your-org/voiceai-orchestrator
cd voiceai-orchestrator
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run backend
python -m app.main

# Run dashboard
cd dashboard && npm install && npm run dev

# Run all tests
cd .. && python -m pytest app/__tests__/ -v
cd dashboard && npx vitest run && npx tsc --noEmit

# Run with GPU
docker compose --profile gpu up -d

# Run without GPU
docker compose up -d
```

---

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `app/main.py` | Application entry, provider registration, middleware stack |
| `app/config.py` | All environment variable settings with defaults |
| `app/providers/gpu.py` | GPU auto-detection and device recommendation |
| `app/middleware/auth.py` | JWT Bearer token validation middleware |
| `app/middleware/rate_limit.py` | Token bucket rate limiting |
| `app/services/persistence.py` | Redis/in-memory persistence layer |
| `app/livekit/sip_dispatch.py` | Phone call → LiveKit room routing |
| `app/routers/monitoring.py` | Prometheus metrics, deep health checks |
| `Dockerfile` | Multi-stage build with GPU target |
| `docker-compose.yml` | All service definitions with profiles |
| `.env.example` | All configurable environment variables |

---

*Last updated: May 2026 — VoiceAI Orchestrator v0.1.0*
