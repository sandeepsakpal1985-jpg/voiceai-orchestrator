# KluCaller V2 — Deployment (CPU app + attachable GPU inference)

This document is for a **controlled technical pilot**, not paying customers.

## Topology

```
Internet → Browser
              ↓
     CPU VPS / RunPod CPU / Hostinger / laptop Docker
     - KluCaller app (FastAPI + frontend)
     - LiveKit server
     - (optional) Postgres profile
              ↓  STT_SERVICE_URL / TTS_SERVICE_URL / OLLAMA_BASE_URL
     RunPod GPU (start only while testing)
     - faster-whisper (large-v3-turbo)
     - Ollama + Qwen 14B-class
     - Kokoro TTS
```

Canonical brain is unchanged: `execute_caller_turn` → `ConversationEngine.process_turn`.

---

## Hostinger (`klucaller.creamylane.com` on shared VPS 1822157)

**Status:** pilot-deployable, not production-ready.  
**Safety:** [`deployment/VPS_SAFETY_RULES.md`](../deployment/VPS_SAFETY_RULES.md)

Phase 1 — private (no nginx):

```bash
cd klucaller-v2
cp deployment/env.hostinger.example .env
chmod +x scripts/deploy_hostinger.sh
./scripts/deploy_hostinger.sh          # must print PHASE 1 PASS
curl -sf http://127.0.0.1:8090/health/live
curl -sf http://127.0.0.1:8090/health/ready
```

Phase 2 — DNS: `klucaller` A → `200.97.168.59` (verify externally).

Phase 3 — after review + approval only:

```bash
./scripts/issue_cert_klucaller.sh
APPROVE_NGINX=1 ./scripts/vps_add_klucaller_nginx.sh
./scripts/qa_smoke.sh https://klucaller.creamylane.com
```

GPU stays on RunPod — set `STT_SERVICE_URL` / `TTS_SERVICE_URL` / `OLLAMA_BASE_URL` in `.env` later.

See `docs/HOSTINGER_DEPLOY_HANDOFF.md` and `docs/DEPLOY_READY.md`.

---


```powershell
cd klucaller-v2
$env:PYTHONPATH="backend;.;providers"
$env:KLUCALLER_LLM="mock"   # or ollama / openai
py -3.11 -m uvicorn klucaller_v2.api.main:app --app-dir backend --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/voice`

---

## B. CPU server / Docker (application only)

From `klucaller-v2/`:

```bash
# CPU-only smoke (no GPU yet) — use mock/dev/stub or point URLs at a remote GPU later
export KLUCALLER_LLM=mock
export KLUCALLER_STT=dev
export KLUCALLER_TTS=stub

docker compose -f deployment/docker-compose.yml up -d --build
curl -sf http://127.0.0.1:8080/health/live
curl -sf http://127.0.0.1:8080/health/ready
```

PowerShell:

```powershell
$env:KLUCALLER_LLM="mock"; $env:KLUCALLER_STT="dev"; $env:KLUCALLER_TTS="stub"
docker compose -f deployment/docker-compose.yml up -d
curl.exe -s http://127.0.0.1:8080/health/ready
```

### LiveKit ports

- Default compose publishes **TCP 7880/7881 only**.
- On **Linux / RunPod**, also enable WebRTC UDP:

```bash
docker compose -f deployment/docker-compose.yml -f deployment/docker-compose.webrtc.yml up -d
```

- On **Windows**, a full `50000-50100/udp` publish often fails (Hyper-V reserved ports). Use TCP-only compose + **app WebSocket PCM** fallback for mic/speaker, or move LiveKit to Linux.

### Browser vs container LiveKit URL

| Env | Used by |
|-----|---------|
| `LIVEKIT_URL` | App container / server-side RTC agent (e.g. `ws://livekit:7880`) |
| `LIVEKIT_PUBLIC_URL` | Browser token payload (e.g. `ws://127.0.0.1:7880`) |

Compose defaults set both. Do not give the browser the Docker-internal hostname.

Voice works for **text brain + stub/dev STT** without GPU. For open-source voice, point env at GPU services (section D).

Persistent volumes: `tenant_data`, `demo_outputs`. Do **not** store models on ephemeral container FS.

### Connectivity diagnostic

```powershell
py -3.11 scripts/check_inference_connectivity.py --app http://127.0.0.1:8080 `
  --stt http://<gpu-host>:9000 --tts http://<gpu-host>:9001 --llm http://<gpu-host>:11434
```

Reports DNS, TCP, HTTP health, and latency for each service.

---

## C. RunPod CPU

1. Create a CPU Pod with Docker.
2. Clone/copy `klucaller-v2`.
3. Mount a **network volume** for `shared/tenant_data` and optionally `.env`.
4. Run the same compose file as section B.
5. Expose port 8080 (and LiveKit 7880/7881 + UDP range if using WebRTC).

---

## D. RunPod GPU (inference only)

On the GPU machine:

```bash
cd klucaller-v2
docker compose -f deployment/docker-compose.gpu.yml --profile gpu up --build -d
docker exec -it <ollama-container> ollama pull qwen2.5:14b-instruct
curl -sf http://127.0.0.1:9000/health
curl -sf http://127.0.0.1:9001/health
curl -sf http://127.0.0.1:11434/api/tags
```

On the CPU app `.env`:

```env
KLUCALLER_STT=whisper
KLUCALLER_TTS=kokoro-http
KLUCALLER_LLM=ollama
STT_SERVICE_URL=http://<gpu-host>:9000
TTS_SERVICE_URL=http://<gpu-host>:9001
OLLAMA_BASE_URL=http://<gpu-host>:11434
OLLAMA_MODEL=qwen2.5:14b-instruct
WHISPER_ALLOW_CPU=0
```

Restart app. No application code changes required.

### GPU shutdown loop

```
START GPU → pull models if needed → health check → browser test → STOP GPU
```

Never leave the GPU running overnight.

---

## E. Environment variables (groups)

See root `.env.example` for the full list. Critical:

| Group | Vars |
|-------|------|
| APPLICATION | `KLUCALLER_STT`, `KLUCALLER_TTS`, `KLUCALLER_LLM`, `KLUCALLER_VAD`, `KLUCALLER_LIVEKIT_AUDIO` |
| LIVEKIT | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| STT | `STT_SERVICE_URL`, `WHISPER_MODEL_SIZE`, `WHISPER_ALLOW_CPU`, `WHISPER_LANGUAGE` |
| LLM | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OPENAI_*` |
| TTS | `TTS_SERVICE_URL`, `KOKORO_BASE_URL`, `KLUCALLER_KOKORO_VOICE` |
| SECURITY | `CORS_ORIGINS` |

Secrets never in git. LiveKit credentials stay server-side.

---

## F. Health verification

| Endpoint | Meaning |
|----------|---------|
| `GET /health` / `/health/live` | Process up |
| `GET /health/ready` | Seeded + provider labels + dependency probes |

Ready includes `dependencies.stt`, `dependencies.tts`, `dependencies.llm`, `dependencies.livekit` when configured.

---

## G. Browser access

1. Open `http://<cpu-host>:8080/voice`
2. Select Mumbai Dental Clinic
3. **Connect** then **Mic on**
4. Speak; watch Listening / Thinking / Speaking
5. Interrupt while speaking to test barge-in
6. Enable Debug for latency panel

Audio path:

- Preferred: LiveKit tracks when `livekit.rtc` works (`livekit_audio: true` in `started`)
- Fallback: app WebSocket PCM (still real mic/speaker)

---

## H. Benchmarking

```powershell
py -3.11 scripts/health_check.py --base-url http://127.0.0.1:8080
py -3.11 -m pytest tests -q
```

Voice latency: use `/v1/voice/metrics` after a call, or existing sprint harnesses under `scripts/`.

---

## I. Troubleshooting

| Symptom | Check |
|---------|--------|
| Ready shows STT down | `STT_SERVICE_URL`, GPU pod up, `/health` on :9000 |
| Whisper refuses CPU | Set `WHISPER_ALLOW_CPU=1` only for lab; keep 0 for GPU experiment |
| No audio in browser | Mic permission; if LiveKit fails, PCM path should still work |
| Hallucinations | Bug — brain must use fallback; file issue, do not “fix” with prompt hacks |
| Ollama slow/empty | Model pulled? VRAM enough for 14B? Try `qwen2.5:7b-instruct` |

---

## J. What is not included

Telephony/SIP, CRM, WhatsApp, billing, Kubernetes, serverless GPU, multi-region, production HA.

---

## K. Scripts

| Script | Purpose |
|--------|---------|
| `scripts/health_check.py` | Probe live/ready + optional remote services |
| `scripts/docker_build.ps1` | Build app image |
| `deployment/docker-compose*.yml` | CPU + GPU stacks |
