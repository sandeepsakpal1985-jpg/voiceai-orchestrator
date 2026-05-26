# VoiceAI Orchestrator — Quick Start Guide

> Get up and running with the self-hosted AI voice infrastructure platform in under 5 minutes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start with Docker (Production)](#quick-start-with-docker-production)
3. [Quick Start without Docker (Development)](#quick-start-without-docker-development)
4. [Environment Configuration](#environment-configuration)
5. [Testing](#testing)
6. [Useful Commands](#useful-commands)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Minimum Requirements

| Resource | Requirement |
|----------|-------------|
| RAM | 8 GB (16 GB recommended) |
| Disk | 10 GB free (for models + database) |
| CPU | 4+ cores |
| GPU | Optional (NVIDIA with nvidia-container-toolkit) |
| OS | Linux (recommended), macOS, or Windows (WSL2) |

### Software

- **Docker** v24+ & Docker Compose v2+ — [Install Guide](https://docs.docker.com/engine/install/)
- **Python** 3.12+ — for local development (no Docker)
- **Node.js** 20+ — for dashboard development (no Docker)
- **Ollama** (optional) — pull models: `ollama pull qwen2.5:7b`

---

## Quick Start with Docker (Production)

### Step 1: Clone & Configure

```bash
git clone https://github.com/sandeepsakpal1985-jpg/voiceai-orchestrator.git
cd voiceai-orchestrator

# Create environment file
cp .env.example .env
# Edit .env if needed — defaults work out of the box
```

### Step 2: Pull the LLM Model

```bash
# Download the default model for local AI inference
docker compose run ollama pull qwen2.5:7b
```

> **Note:** This downloads ~4.5 GB. For smaller models, use `qwen2.5:3b` or `gemma2:2b`.

### Step 3: Start All Services

```bash
# Start core services (postgres, ollama, livekit-server, voiceai-api, voiceai-worker)
docker compose up -d

# Follow logs to verify startup
docker compose logs -f
```

### Step 4: Verify

```bash
# Check API health
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"0.1.0"}

# Open Dashboard
open http://localhost:3000
```

### Step 5: Start Dashboard (Optional)

The dashboard requires the `full` profile:

```bash
docker compose --profile full up -d dashboard
open http://localhost:3000
```

---

## Quick Start without Docker (Development)

### Step 1: Backend Setup

```bash
cd voiceai-orchestrator

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

### Step 2: Start Infrastructure Services

Run Postgres, Redis, and Ollama via Docker:

```bash
docker compose up -d postgres redis ollama
```

### Step 3: Apply Database Migrations

```bash
# Backend migrations are auto-applied at startup.
# For dashboard, run:
cd dashboard
cp .env.example .env
npm install
npx prisma db push
npx prisma db seed
```

### Step 4: Start the Backend

```bash
cd ..  # back to voiceai-orchestrator/
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: `curl http://localhost:8000/health`

### Step 5: Start the Dashboard

```bash
# In a new terminal
cd dashboard
npm run dev
```

Open: http://localhost:3000

### Step 6: Start WebSocket Server (Optional)

For real-time updates:

```bash
cd dashboard
npm run dev:ws  # Runs WebSocket server on port 3001
```

---

## Environment Configuration

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SECRET` | (set in .env) | JWT signing secret |
| `DATABASE_URL` | `postgresql://voiceai:voiceai@localhost:5432/voiceai` | PostgreSQL connection |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `STT_PROVIDER` | `whisper` | Speech-to-text engine |
| `LLM_PROVIDER` | `ollama` | Language model provider |
| `TTS_PROVIDER` | `kokoro` | Text-to-speech engine |
| `LIVEKIT_ENABLED` | `false` | Enable LiveKit voice transport |

### Provider Options

| Category | Available Providers | Default |
|----------|-------------------|---------|
| **STT** | `whisper`, `deepgram` | `whisper` |
| **LLM** | `ollama`, `openai`, `gemini`, `openrouter` | `ollama` |
| **TTS** | `kokoro`, `openvoice`, `xtts`, `qwen3`, `elevenlabs` | `kokoro` |
| **Memory** | `chromadb` | `chromadb` |

---

## Testing

### Run All Backend Tests (351 tests)

```bash
cd voiceai-orchestrator
python -m pytest app/__tests__/ -v
```

### Run All Dashboard Tests (204 tests)

```bash
cd dashboard
npx vitest run
```

### Run E2E Tests

```bash
cd dashboard

# First start the dev server
npm run dev

# In another terminal, run Playwright tests
npx playwright test

# With UI mode
npx playwright test --ui
```

### Run Specific Test Categories

```bash
# Backend — specific module
python -m pytest app/__tests__/test_advanced.py -v

# Dashboard — specific test file
npx vitest run src/__tests__/lib/rate-limiter.test.ts

# E2E — specific spec
npx playwright test src/__tests__/e2e/auth.spec.ts
```

---

## Useful Commands

### Docker

```bash
# Start everything
docker compose up -d

# Start with GPU acceleration
docker compose --profile gpu up -d

# View logs
docker compose logs -f

# Stop everything
docker compose down

# Reset database
docker compose down -v
```

### Backend

```bash
# Start with hot-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Check runtime status
curl http://localhost:8000/runtime/status

# View API docs
open http://localhost:8000/docs
```

### Dashboard

```bash
# Development server
npm run dev

# Build for production
npm run build

# Production start
npm run start

# Type checking
npm run typecheck

# Linting
npm run lint
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process on port 8000
lsof -i :8000  # Linux/macOS
netstat -ano | findstr :8000  # Windows (then: taskkill /PID <pid> /F)

# Or use a different port
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

### Ollama Connection Refused

- Ensure Ollama is running: `docker compose ps ollama`
- Check the URL in `.env`: `OLLAMA_BASE_URL=http://localhost:11434`
- If using Docker, the internal URL is `http://ollama:11434`

### Database Connection Failed

- Ensure Postgres is running: `docker compose ps postgres`
- Check `DATABASE_URL` in `.env`
- Verify Postgres health: `docker compose exec postgres pg_isready -U voiceai`

### GPU Not Detected

- Verify NVIDIA drivers: `nvidia-smi`
- Install nvidia-container-toolkit: [GPU_SETUP.md](docs/GPU_SETUP.md)
- The app falls back to CPU automatically — GPU is optional

### LiveKit Server Won't Start

- Ensure the config file is valid YAML
- Check logs: `docker compose logs livekit-server`
- Default port 7880 must be free
- The latest LiveKit server uses `keys:` map instead of `api.key`/`api.secret`

### Tests Fail

```bash
# Backend
cd app && python -m pytest app/__tests__/ -v --tb=long

# Dashboard
cd dashboard && npx vitest run --reporter=verbose

# Clear caches
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null
```

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────┐
                    │              Browser / Phone                │
                    │         (WebRTC / SIP / PSTN)               │
                    └──────────────────┬──────────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │  LiveKit Server  │── WebRTC/SIP transport
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              ┌─────▼─────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │  Agent     │    │  FastAPI    │    │  Dashboard  │
              │  Worker    │    │  Backend    │    │  (Next.js)  │
              │ STT→LLM→TTS│    │  REST API   │    │  Admin UI   │
              └────────────┘    └──────┬──────┘    └─────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              ┌─────▼─────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │  Ollama    │    │  PostgreSQL │    │  ChromaDB   │
              │  (LLM)     │    │  (Storage)  │    │  (RAG)      │
              └────────────┘    └─────────────┘    └─────────────┘
```

For a detailed component map, see [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md).

---

## Next Steps

- [ ] Pull an Ollama model: `docker compose run ollama pull qwen2.5:7b`
- [ ] Configure GPU acceleration: see [docs/GPU_SETUP.md](docs/GPU_SETUP.md)
- [ ] Set up SIP phone integration: see [ARCHITECTURE.md](ARCHITECTURE.md#sip-configuration)
- [ ] Deploy to cloud: see `docs/DEPLOY_HETZNER.md`, `docs/DEPLOY_OVH.md`, `docs/DEPLOY_RUNPOD.md`
