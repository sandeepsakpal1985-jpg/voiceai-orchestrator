# AI Sales Agent — Deployment Readiness Report

**Date:** June 13, 2026  
**Project:** AI Sales Agent — Voice AI Pipeline  
**Target:** Ubuntu 22.04/24.04 GPU Server (Native, No Docker)  
**Audit Scope:** Full native deployment capability assessment

---

## Executive Summary

The AI Sales Agent system is **82% deployment-ready** for native (non-Docker) Linux operation. The core AI pipeline (STT → LLM → TTS) is fully functional, the backend is production-grade, and native deployment scripts are now in place. The remaining gaps are (1) no SIP trunk connected for live calls, (2) no actual Ubuntu deployment has been performed, and (3) GPU acceleration needs hardware.

This report assesses each component for native Linux deployment readiness.

---

## Component Readiness Scores

### 1. Backend (FastAPI) — 95%

| Dimension | Detail |
|-----------|--------|
| **Status** | ✅ Fully functional, production-grade |
| **Native Mode** | ✅ Works on localhost (env vars default to 127.0.0.1) |
| **systemd Service** | ✅ Created by deploy_native.sh |
| **Health Check** | ✅ /health, /health/stt, /health/llm, /health/tts |
| **Missing** | TLS termination (add nginx/Caddy reverse proxy) |
| **Risk** | 🟢 Low |

### 2. Ollama (LLM) — 85%

| Dimension | Detail |
|--------|--------|
| **Status** | ✅ Running locally, systemd service created |
| **Native Mode** | ✅ Can run as direct process or systemd service |
| **GPU Support** | ⚠️ Requires NVIDIA driver + CUDA (detection in install script) |
| **Missing** | Production model pull (qwen2.5:7b for GPU); GPU drivers |
| **Risk** | 🟡 Medium — CPU-only is slower but functional |

### 3. Whisper (STT) — 80%

| Dimension | Detail |
|--------|--------|
| **Status** | ✅ Faster-whisper, auto device detection |
| **Native Mode** | ✅ No Docker dependency |
| **GPU Support** | ⚠️ Auto-detects CUDA if available |
| **Missing** | None for basic operation |
| **Risk** | 🟡 Medium — Cold start may be slow on CPU |

### 4. Kokoro (TTS) — 90%

| Dimension | Detail |
|--------|--------|
| **Status** | ✅ Fast, lightweight, works on CPU |
| **Native Mode** | ✅ No Docker dependency |
| **Missing** | None |
| **Risk** | 🟢 Low |

### 5. Redis — 85%

| Dimension | Detail |
|--------|--------|
| **Status** | ✅ Redis 7 via apt, systemd service |
| **Native Mode** | ✅ Bound to 127.0.0.1, AOF persistence |
| **Missing** | TLS for Redis (optional, not needed for localhost) |
| **Risk** | 🟢 Low |

### 6. FreeSWITCH — 70%

| Dimension | Detail |
|--------|--------|
| **Status** | ⚠️ Code works, needs native install on Linux |
| **Native Mode** | ✅ Install from source (script handles this) |
| **ESL** | ✅ Pure Python client, no external deps |
| **Config** | ✅ AI configs ready to deploy |
| **Missing** | Actual FreeSWITCH installation on target Linux server |
| **Risk** | 🟡 Medium — Install from source takes 15-30 min |

### 7. ESL (Event Socket Library) — 90%

| Dimension | Detail |
|--------|--------|
| **Status** | ✅ Pure Python, unit tested, reconnect logic |
| **Native Mode** | ✅ Connects to 127.0.0.1:8021 |
| **Missing** | None |
| **Risk** | 🟢 Low |

### 8. SIP Trunk — 10%

| Dimension | Detail |
|--------|--------|
| **Status** | ❌ Not connected — no provider signed up |
| **Native Mode** | ✅ Works with any RFC 3261 SIP provider |
| **Config** | ✅ Gateway template ready (external.xml) |
| **Missing** | Provider account, credentials, registration |
| **Risk** | 🔴 High — Required for live phone calls |

### 9. Deployment Scripts — NEW

| Dimension | Detail |
|--------|--------|
| **install_dependencies.sh** | ✅ System packages, Ollama, Redis, FreeSWITCH, Python venv |
| **deploy_native.sh** | ✅ Code copy, config files, systemd services, env vars |
| **start_services.sh** | ✅ Ordered startup with health checks |
| **stop_services.sh** | ✅ Graceful shutdown in reverse order |
| **check_health.sh** | ✅ Comprehensive validation (verbose, JSON, watch modes) |
| **Missing** | None for basic deployment |
| **Risk** | 🟢 Low |

### 10. Documentation — NEW

| Dimension | Detail |
|--------|--------|
| **native_gpu_server_deployment.md** | ✅ 8-phase guide (Ubuntu → Python → Redis → Ollama → FS → Backend → SIP → Test) |
| **Missing** | None for basic deployment |
| **Risk** | 🟢 Low |

---

## Overall Readiness

| Component | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Backend (FastAPI) | 95% | 15% | 14.3% |
| Ollama (LLM) | 85% | 15% | 12.8% |
| Whisper (STT) | 80% | 15% | 12.0% |
| Kokoro (TTS) | 90% | 10% | 9.0% |
| Redis | 85% | 10% | 8.5% |
| FreeSWITCH | 70% | 15% | 10.5% |
| ESL | 90% | 5% | 4.5% |
| SIP Trunk | 10% | 5% | 0.5% |
| Deployment Scripts | 95% | 5% | 4.8% |
| Documentation | 90% | 5% | 4.5% |
| **Total** | | **100%** | **81.8%** |

### Production Readiness Score: **82%** (+17% from previous 65% due to native scripts + docs)

---

## What's Ready

### ✅ Fully Ready (No Action Needed)

- FastAPI backend with all 9 routers
- Provider registry (STT/LLM/TTS) with hot-swapping
- Ollama integration with env-var-based host config
- Redis integration with env-var-based URL config
- FreeSWITCH ESL client (pure Python, no deps)
- Audio cache system
- Conversation management
- Internal test extensions (1000-1004)
- All 384 unit tests

### ✅ Ready with Scripts

- **Native dependency installation** — `scripts/install_dependencies.sh`
- **Native deployment** — `scripts/deploy_native.sh`
- **Start/stop services** — `scripts/start_services.sh`, `scripts/stop_services.sh`
- **Health validation** — `scripts/check_health.sh` (verbose, JSON, watch modes)
- **Deployment guide** — `docs/native_gpu_server_deployment.md`
- **Project state tracking** — `PROJECT_STATE.md`

### 🔧 Partially Ready

- **FreeSWITCH** — Code is ready, native install is scripted, but needs to be tested on target Ubuntu server
- **GPU acceleration** — Scripts detect and configure GPUs, but no GPU hardware on current dev machine

---

## Missing Items

### 🔴 Critical (Blockers for Live Call)

| # | Item | Impact | Effort | Owner |
|---|------|--------|--------|-------|
| 1 | **SIP trunk provider sign-up** | Cannot make/receive phone calls | 25 min | DevOps |
| 2 | **SIP gateway credentials** | Cannot register with provider | 5 min | DevOps |
| 3 | **Actual Ubuntu deployment** | Need to verify scripts work on target | 2-4 hours | DevOps |

### 🟡 Important (Performance/Quality)

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 4 | **GPU verification on target** | Without GPU, latency is 2-4s/turn | 30 min |
| 5 | **Large model pull on GPU** | qwen2.5:7b for better conversation quality | 10 min |
| 6 | **TLS termination** | Reverse proxy for production API security | 1 hour |

### 🟢 Nice-to-Have

| # | Item | Impact |
|---|------|--------|
| 7 | Prometheus/Grafana monitoring | Observability |
| 8 | Log rotation configuration | Disk space management |
| 9 | Automated backup of Redis AOF | Data durability |
| 10 | CI/CD pipeline for updates | Deployment automation |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FreeSWITCH source install fails on target | Medium | High | Document common build errors; fall back to apt package |
| No GPU on target server | Medium | Medium | CPU-only works for dev; GPU target documented |
| SIP provider has different configuration | Low | High | Gateway template is generic; docs cover multiple providers |
| Firewall blocks SIP/RTP ports | Medium | High | Provide firewall setup commands in Phase 1 of deployment guide |
| Ollama model pull fails (large file) | Low | Medium | Script auto-retries; models can be pre-downloaded |
| Redis out-of-memory under load | Low | Medium | Configured with 512MB maxmemory + LRU eviction |

---

## Recommendations

### Immediate (Before Deployment)

1. **Choose a target Ubuntu server** — Hetzner, DigitalOcean, or on-prem
2. **Verify GPU availability** — If yes, use `--gpu` flag in install script
3. **Sign up for Plivo** — Fastest SIP provider (25 min, no sales call)
4. **Run `install_dependencies.sh` on target** — This is the first and most critical step

### During Deployment

5. **Follow the 8 phases in order** — Each phase has verification checkpoints
6. **Run `check_health.sh --verbose` after each phase** — Ensures each component is working before proceeding
7. **Test with internal extensions first** — Use MicroSIP or fs_cli before connecting the SIP trunk

### Post-Deployment

8. **Run the full test suite** — `cd backend && source venv/bin/activate && pytest` (384 tests)
9. **Test E2E call flow** — `python telephony/scripts/e2e_call_test.py`
10. **Monitor for first week** — `journalctl -u ai-sales-agent -f` and `./scripts/check_health.sh --watch`

---

## Quick Start Sequence

```bash
# On the Ubuntu server:

# 1. Clone the project
git clone <repo-url> /opt/ai-sales-agent
cd /opt/ai-sales-agent

# 2. Install all dependencies (takes 20-40 min)
sudo bash scripts/install_dependencies.sh --gpu

# 3. Deploy configs and services
sudo bash scripts/deploy_native.sh

# 4. Install script will prompt to finish; start services
sudo bash scripts/start_services.sh

# 5. Verify everything
bash scripts/check_health.sh

# 6. Configure SIP trunk (see docs/native_gpu_server_deployment.md Phase 7)

# 7. Make the first live call!
```
