# AI Sales Agent — Project State

**Last updated:** June 13, 2026 (v4 — WSL Full Stack Deployment Verified)

## Current Status

| Dimension | Status | Details |
|-----------|--------|---------|
| **Backend (FastAPI)** | ✅ Running | Port 8000, all 3 providers registered |
| **Local LLM** | ✅ Working | Ollama (Qwen 2.5:1.5b) on CPU |
| **STT** | ✅ Working | Whisper (faster-whisper, tiny) |
| **TTS** | ✅ Working | Kokoro (local) |
| **FreeSWITCH (Docker)** | ✅ Running | ESL port 8021 accessible, SIP port 5060, base image |
| **Redis** | ✅ Running | Local, responding PONG |
| **SIP Trunk** | ❌ Not connected | Needs SIP provider signup |
| **Live Call** | ❌ Not made | Blocked on ESL auth timing + SIP trunk |
| **WSL Deployment** | ✅ Verified | All services running in WSL2 Ubuntu 24.04 |

## WSL Deployment State

**WSL2 Ubuntu 24.04** — All core services deployed and running:

| Component | Host | Port | Status |
|-----------|------|------|--------|
| FastAPI Backend | 127.0.0.1 | 8000 | ✅ Health OK, providers: whisper, ollama, kokoro |
| Ollama | 127.0.0.1 | 11434 | ✅ qwen2.5:1.5b model ready |
| Redis | 127.0.0.1 | 6379 | ✅ PONG |
| FreeSWITCH (Docker) | 127.0.0.1 | 5060/8021 | ✅ Running, ESL accessible |

## 
Key Issues Found During WSL Deployment
1. **Custom Docker image** — Bypassing the base entrypoint causes freeswitch.xml to be missing; base image entrypoint must be preserved
2. **ESL config** — `listen-ip="::"` (IPv6) in base image; changed to `0.0.0.0` on Windows side, custom image rebuilt. Volume mounts unreliable across restarts
3. **ESL auth timing** — Socket connects but auth response occasionally empty (<500ms timing window)
4. **SignalWire PAT required** — apt install of FreeSWITCH now requires account; build from source is the reliable alternative
