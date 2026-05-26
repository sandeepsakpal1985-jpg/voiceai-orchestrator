# VoiceAI Orchestrator

> **Self-Hosted AI Voice Infrastructure Platform**  
> Fully local voice AI pipeline with LiveKit realtime transport, zero external API dependencies.

[![CI](https://github.com/your-org/voiceai-orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/voiceai-orchestrator/actions/workflows/ci.yml)

---

## Overview

VoiceAI Orchestrator is a complete platform for building AI-powered voice applications — entirely self-hosted. It provides:

- **🎤 Speech-to-Text** — Local Whisper (faster-whisper) with streaming support
- **🧠 Language Model** — Ollama-powered Qwen, Mistral, Llama, Gemma (fully local)
- **🔊 Text-to-Speech** — Kokoro (lightweight), OpenVoice (voice cloning), XTTS (multi-language)
- **📞 Phone Integration** — LiveKit SIP with Twilio Elastic SIP Trunk (PSTN)
- **📊 Dashboard** — Next.js admin UI with live monitoring, analytics, CRM
- **🧠 RAG + Memory** — ChromaDB vector store with local embeddings
- **🔧 MCP Tool Layer** — CRM tools, knowledge base search
- **💬 Social Automation** — Instagram, Facebook, WhatsApp integration

### Architecture

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

---

## Quick Start

### Prerequisites

- Docker & Docker Compose v2
- 8 GB+ RAM (16 GB recommended)
- (Optional) NVIDIA GPU with nvidia-container-toolkit

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/voiceai-orchestrator.git
cd voiceai-orchestrator

cp .env.example .env
# Edit .env if needed (defaults work out of the box)
```

### 2. Pull Ollama Model

```bash
# Download the default LLM model for local inference
docker compose run ollama pull qwen2.5:7b
```

### 3. Start Services

```bash
# Start all core services
docker compose up -d

# Check health
curl http://localhost:8000/health
```

### 4. Open Dashboard

Navigate to [http://localhost:3000](http://localhost:3000)

---

## Docker Services

| Service | Purpose | Port |
|---------|---------|------|
| `voiceai-api` | FastAPI backend | `8000` |
| `voiceai-worker` | LiveKit agent worker | `8001` |
| `livekit-server` | Realtime voice transport | `7880-7882` |
| `ollama` | Local LLM inference | `11434` |
| `postgres` | Database | `5432` |
| `dashboard` | Next.js admin UI | `3000` |
| `redis` | Caching (optional) | `6379` |

---

## Quick Reference

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Start with GPU acceleration
docker compose --profile gpu up -d

# Stop everything
docker compose down

# Run tests
cd app && python -m pytest app/__tests__/ -v

# Check runtime status
curl http://localhost:8000/runtime/status
```

---

## Provider Configuration

VoiceAI Orchestrator is **local-first** — it works fully offline without any API keys.

| Service | Default Provider | Fallback Options |
|---------|-----------------|------------------|
| STT | Whisper (local) | Deepgram (cloud) |
| LLM | Ollama / Qwen 2.5 7B (local) | OpenAI, Gemini, OpenRouter |
| TTS | Kokoro (local, ~82M params) | OpenVoice, XTTS, ElevenLabs |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full provider priority and selection guide.

---

## GPU Acceleration

For production voice pipelines, GPU acceleration provides 5-30x speedup:

```bash
# Requires: nvidia-container-toolkit (see docs/GPU_SETUP.md)

# Build GPU-enabled images
docker compose --profile gpu build

# Start with GPU
docker compose --profile gpu up -d
```

Detailed GPU setup: [docs/GPU_SETUP.md](docs/GPU_SETUP.md)

---

## Phone Integration (SIP / PSTN)

Connect to the telephone network via Twilio Elastic SIP Trunk:

```bash
# SIP is enabled by default
# Configure in .env:
#   SIP_ENABLED=true
#   SIP_SERVER_ADDRESS=your-public-ip
#   SIP_PORT=5060
```

See [ARCHITECTURE.md](ARCHITECTURE.md#sip-configuration-twiliopstn-integration-via-livekit-sip) for Twilio setup.

---

## Deployment Targets

| Provider | Type | GPU Available | Guide |
|----------|------|---------------|-------|
| **Hetzner** | Dedicated GPU | ✅ (A100, RTX 4090) | `docs/DEPLOY_HETZNER.md` |
| **OVH** | GPU Cloud | ✅ (T4, A100) | `docs/DEPLOY_OVH.md` |
| **RunPod** | Serverless GPU | ✅ (varies) | `docs/DEPLOY_RUNPOD.md` |
| **Bare Metal** | On-premise | ✅ | `docs/DEPLOY_BAREMETAL.md` |

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Architecture, provider priority, design decisions |
| [docs/GPU_SETUP.md](docs/GPU_SETUP.md) | GPU acceleration setup guide |
| [dashboard/AGENTS.md](dashboard/AGENTS.md) | Next.js agent conventions |

---

## License

MIT
