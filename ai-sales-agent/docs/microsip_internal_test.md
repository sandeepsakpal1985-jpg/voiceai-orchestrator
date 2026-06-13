# Internal MicroSIP → FreeSWITCH → AI Agent Test Guide

**Objective:** Make the first internal SIP call from MicroSIP to the AI Agent without using any SIP provider, DID number, or external phone network.

**Flow:**
```
MicroSIP (ext 1000) → FreeSWITCH → AI Agent (STT → LLM → TTS) → FreeSWITCH → MicroSIP (ext 1000)
```

**No SIP provider, no DID, no external telecom network required.**

---

## Prerequisites

| Component | Status | How to Verify |
|-----------|--------|---------------|
| Docker Desktop | ✅ Must be running | `docker ps` should work |
| FreeSWITCH container | ✅ ai-freeswitch | `docker ps \| grep ai-freeswitch` |
| Ollama | ✅ Running on port 11434 | `curl http://localhost:11434/api/tags` |
| Backend | ✅ Running on port 8000 | `curl http://localhost:8000/health` |
| MicroSIP | ✅ Installed | See [microsip-setup.md](microsip_setup.md) for install |
| Network | ✅ 127.0.0.1:5060 reachable | `telnet 127.0.0.1 5060` or check FreeSWITCH logs |

---

## Quick Start (One Command)

```powershell
# From the project root:
.\scripts\start_internal_test.ps1
```

This will:
1. ✅ Verify Docker is running
2. ✅ Start FreeSWITCH + Redis containers if not running
3. ✅ Inject custom configs (dialplan, extensions, SIP profiles)
4. ✅ Reload FreeSWITCH configuration
5. ✅ Verify Ollama is running with the required model
6. ✅ Check ESL connectivity (port 8021)
7. ✅ Check SIP port (5060)
8. ✅ Start the backend if not running
9. ✅ Print PASS/FAIL for each dependency

---

## A. MicroSIP Configuration

Open MicroSIP → **Menu → SIP Account Settings** (or press `F8`):

| Setting | Value |
|---------|-------|
| **Account Name** | `FreeSWITCH Internal Test` |
| **Server/Proxy** | `127.0.0.1` |
| **Port** | `5060` |
| **Transport** | `UDP` |
| **Username** | `1000` |
| **Password** | `1000pass` |
| **Display Name** | `Test Extension 1000` |
| **Domain/Realm** | `127.0.0.1` |

> **Important:** If `127.0.0.1` doesn't work, try:
> - `192.168.65.3` (Docker bridge IP on Windows)
> - Your host LAN IP (e.g., `192.168.x.x`)
> - `103.71.18.205` (if previously configured)

---

## B. How to Register Extension 1000

1. **Open MicroSIP**
2. Press **F8** to open SIP Account Settings
3. Enter the configuration from Section A above
4. Click **OK**
5. Wait 3–5 seconds for registration

### Expected Status

| Indicator | Meaning |
|-----------|---------|
| ✅ **Green icon** | Registered successfully |
| 🔴 **Red icon** | Registration failed — see troubleshooting |
| ⏳ **Yellow/Flashing** | Attempting to register |

### Verify Registration on FreeSWITCH

```bash
# Check registered users
docker exec ai-freeswitch fs_cli -x "show registrations"

# Expected output:
# 1000        127.0.0.1:xxxxx       internal        UDP          0

# Check SIP profile status
docker exec ai-freeswitch fs_cli -x "sofia status profile internal"
```

---

## C. How to Dial AI Agent Extensions

1. **Ensure MicroSIP shows green** (registered successfully)
2. In the **dial pad**, type one of:
   - `1001` — **Default AI Agent** (generic sales assistant)
   - `1002` — **Customer Support AI Agent**
   - `1003` — **Sales AI Agent**
   - `1004` — **Billing AI Agent**
3. Press **Call** (or Enter)
4. You should hear: *"Hello! Thank you for calling. This is your AI sales assistant. How can I help you today?"*
5. **Speak into your microphone** — ask a question
6. Wait 2–5 seconds for the AI to process
7. **Hear the AI response** through your speakers

---

## D. Expected Logs

### FreeSWITCH Logs

```bash
# Watch FreeSWITCH logs in real-time
docker logs ai-freeswitch --tail 50 -f
```

When you dial 1001, you should see:

```
[SIP REGISTER] Channel created (caller: 1000, called: 1001)
[CALL RECEIVED] Call xxx: Incoming from 1000 -> 1001
[CALL ANSWERED] Call xxx: Answered, starting AI conversation
```

### Backend Logs

```bash
# Watch backend logs
docker logs ai-fs-backend --tail 50 -f
# OR if running locally:
# Look at the console where uvicorn is running
```

You should see:
```
[STT START] Call xxx: Transcribing N bytes...
[STT COMPLETE] Call xxx: Transcribed: 'your speech text'
[LLM START] Call xxx: Processing through LLM...
[LLM COMPLETE] Call xxx: LLM response (N chars)
[TTS START] Call xxx: Synthesizing response...
[TTS COMPLETE] Call xxx: Audio synthesized and sent to caller
[AUDIO PLAYBACK] Call xxx: Response played to caller
[CALL ENDED] Call xxx: Conversation ended after N turns (Xs)
```

### Full Log Sequence (MicroSIP → AI → MicroSIP)

```
[SIP REGISTER]    1000 registers with FreeSWITCH
[CALL RECEIVED]   1000 dials 1001
[CALL ANSWERED]   FreeSWITCH answers, ESL bridge picks up
[STT START]       Recording caller audio starts
[STT COMPLETE]    Audio transcribed to text
[LLM START]       Text sent to language model
[LLM COMPLETE]    AI generates response
[TTS START]       Response converted to speech
[TTS COMPLETE]    Speech audio ready
[AUDIO PLAYBACK]  Speech played back to caller
... (repeat for each turn)
[CALL ENDED]      Call completed
```

---

## E. Validation Script

Run the comprehensive validation script to verify the full setup:

```bash
python telephony/scripts/test_internal_extension.py
```

This checks:
1. ✅ ESL connectivity to FreeSWITCH
2. ✅ FreeSWITCH health (status, modules, codecs)
3. ✅ Extension 1000 and 1001 exist in directory
4. ✅ Dialplan resolves 1001 → AI Agent
5. ✅ Backend connectivity (port 8000)
6. ✅ STT/LLM/TTS provider availability

---

## F. Troubleshooting

### 1. Cannot connect to FreeSWITCH

| Symptom | Cause | Fix |
|---------|-------|-----|
| `docker: command not found` | Docker not installed | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Cannot connect to Docker daemon | Docker not running | Start Docker Desktop from Start Menu |
| Container not found | Stack not started | Run: `docker compose -f docker/freeswitch-docker-compose.yml up -d` |

### 2. MicroSIP won't register

| Symptom | Cause | Fix |
|---------|-------|-----|
| Red icon, timeout | Port 5060 not accessible | Check `docker ps \| grep ai-freeswitch` |
| Red icon, auth failure | Wrong password | Ensure password is `1000pass` |
| Red icon, no response | Wrong IP address | Try `192.168.65.3` or host LAN IP |
| Yellow flashing | Still registering | Wait 10 seconds |

**Quick fix:**
```bash
# Check if FreeSWITCH is listening on SIP
docker exec ai-freeswitch fs_cli -x "sofia status profile internal"

# Check if the extension exists
docker exec ai-freeswitch fs_cli -x "show registrations"

# Reload config if needed
.\scripts\setup_internal_fs.ps1
```

### 3. Call connects but no audio

| Symptom | Cause | Fix |
|---------|-------|-----|
| Call connects, no greeting | ESL bridge not connected | Check backend logs: `http://localhost:8000/fs/health` |
| Call connects, no response | Backend not running | Start backend: `.\scripts\start_internal_test.ps1` |
| One-way audio | RTP ports blocked | Docker host networking should expose all UDP ports |
| Call drops immediately | Dialplan not matching | Run: `docker exec ai-freeswitch fs_cli -x "dialplan 1001 ai-sales-agent"` |

### 4. Backend errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502/Connection refused | Backend not running | Start: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| STT fails | Whisper model not loaded | Check backend logs for model loading errors |
| LLM fails | Ollama not running | Verify: `curl http://localhost:11434/api/tags` |
| TTS fails | Kokoro model error | Check `http://localhost:8000/health/tts` |

### 5. Reset Everything

```powershell
# Stop all containers
docker compose -f docker/freeswitch-docker-compose.yml down

# Restart fresh
docker compose -f docker/freeswitch-docker-compose.yml up -d

# Wait for health
Start-Sleep -Seconds 10

# Inject configs
.\scripts\setup_internal_fs.ps1

# Start backend
.\scripts\start_internal_test.ps1 -NoConfigInject
```

---

## G. Verification Checklist

Before making the test call:

- [ ] Docker Desktop is running
- [ ] `docker ps` shows `ai-freeswitch` (healthy)
- [ ] `curl http://localhost:11434/api/tags` returns model list
- [ ] `curl http://localhost:8000/health` returns OK
- [ ] MicroSIP shows green ✅ status
- [ ] `docker exec ai-freeswitch fs_cli -x "show registrations"` shows 1000
- [ ] Config injected: `.\scripts\setup_internal_fs.ps1` completed without errors

---

## H. Architecture Reference

```
┌─────────────────────────────────────────────────────────┐
│                    Windows Host                          │
│                                                          │
│   ┌──────────┐      ┌──────────────┐                     │
│   │ MicroSIP │──────│  FreeSWITCH  │ (Docker Container)  │
│   │ (1000)   │ SIP  │  (Docker)    │                     │
│   └──────────┘      └──────┬───────┘                     │
│                             │ ESL (port 8021)            │
│                             ▼                             │
│                    ┌────────────────┐                     │
│                    │  ESL Bridge    │                     │
│                    │  (bridge_svc)  │                     │
│                    └───────┬────────┘                     │
│                            │                              │
│                    ┌───────▼────────┐                     │
│                    │  Call Handler  │                     │
│                    │  (per call)    │                     │
│                    └───────┬────────┘                     │
│                            │                              │
│              ┌─────────────┼─────────────┐                │
│              ▼             ▼             ▼                │
│         ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│         │   STT    │ │   LLM    │ │   TTS    │           │
│         │ (Whisper)│ │ (Ollama) │ │ (Kokoro) │           │
│         └──────────┘ └──────────┘ └──────────┘           │
│                                                          │
│         Backend (FastAPI, port 8000)                     │
└─────────────────────────────────────────────────────────┘
```
