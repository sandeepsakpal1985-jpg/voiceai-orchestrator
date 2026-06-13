# First Live Call — End-to-End Validation Guide

This guide walks through making the **first real phone call** through FreeSWITCH into the AI voice pipeline (Whisper → Qwen → Kokoro).

---

## Prerequisites

| Component | Status Check |
|-----------|-------------|
| FreeSWITCH installed | `fs_cli -x "status"` |
| Ollama running | `curl http://localhost:11434/api/tags` |
| Backend running | `curl http://localhost:8000/health` |
| ESL bridge connected | `curl http://localhost:8000/fs/health` |

---

## Installation

### 1. FreeSWITCH (Windows)

```powershell
# Download from https://files.freeswitch.org/windows/
# Install to C:\Program Files\FreeSWITCH\

# Navigate to conf directory
cd "C:\Program Files\FreeSWITCH\conf"

# Copy AI bridge config
copy C:\ai-sales-agent\telephony\configs\freeswitch\sip_profiles\internal.xml .
copy C:\ai-sales-agent\telephony\configs\freeswitch\ai_bridge.xml .

# Copy dialplan
copy C:\ai-sales-agent\telephony\configs\freeswitch\dialplan\default.xml dialplan\
```

### 2. Backend Setup

```bash
# From project root
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure FreeSWITCH integration
set FREESWITCH_BRIDGE_ENABLED=true
set FREESWITCH_ESL_HOST=127.0.0.1
set FREESWITCH_ESL_PORT=8021

# Start the backend
python -m uvicorn app.main:app --reload --port 8000
```

---

## Start Order (Critical!)

Start components in this exact order — the bridge service auto-retries, but starting in order avoids unnecessary retry noise.

### Step 1: Start FreeSWITCH

```bash
# Windows (as Administrator)
net start FreeSWITCH
# OR
"C:\Program Files\FreeSWITCH\fs_cli.exe" -x "fsctl shutdown"
"C:\Program Files\FreeSWITCH\FreeSwitchConsole.exe"
```

**Verification Checkpoint #1:**
```bash
fs_cli -x "status"
```
Expected output:
```
FreeSWITCH Version X.X.X (git ...)
UP 0 min, 0 sec
Session(s) Since Startup: 0
Session(s) In Progress: 0
```

### Step 2: Start Ollama

```bash
ollama serve
```

**Verification Checkpoint #2:**
```bash
curl http://localhost:11434/api/tags
```
Expected: JSON with `qwen2.5:3b` (or your configured model).

### Step 3: Start the Backend

```bash
cd backend
set FREESWITCH_BRIDGE_ENABLED=true
python -m uvicorn app.main:app --reload --port 8000
```

**Expected startup logs (look for these):**
```
STAGE[FS BRIDGE START] Starting FreeSWITCH bridge service...
STAGE[ESL CONNECT] Connecting to FreeSWITCH ESL at 127.0.0.1:8021 ...
STAGE[ESL CONNECTED] TCP connection established
STAGE[ESL AUTHENTICATED] FreeSWITCH ESL successfully authenticated
STAGE[ESL SUBSCRIBE] Subscribing to events: CHANNEL_ANSWER ...
STAGE[ESL SUBSCRIBED] Event subscription OK
STAGE[ESL LISTENER STARTED] ESL event listener started
STAGE[FS BRIDGE STARTED] FreeSWITCH bridge service started
```

### Step 4: Verify Connectivity

```bash
# Backend health
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"1.0.0",...}

# FS integration health
curl http://localhost:8000/fs/health
# Expected: {"status":"ok","active_calls":0,...}

# Provider endpoints
curl http://localhost:8000/health/stt
curl http://localhost:8000/health/llm
curl http://localhost:8000/health/tts
curl http://localhost:8000/health/freeswitch
```

**Verification Checkpoint #3 — ESL connected:**
```bash
curl http://localhost:8000/health/freeswitch
```
Expected:
```json
{"status":"ok","esl_connected":true,"bridge_running":true,"active_calls":0}
```

---

## Making the First Call

### Option A: Internal SIP Call (No Phone)

Use `fs_cli` to simulate an internal call:

```bash
# From FreeSWITCH console or fs_cli:
originate user/1000 &park
```

Then from ESL, answer and bridge:

```bash
# In fs_cli:
uuid_answer <call-uuid>
```

### Option B: Softphone

1. Install **Zoiper** or **Linphone** (free softphones)
2. Configure SIP account:
   - **Domain:** `127.0.0.1`
   - **Username:** `1000`
   - **Password:** `1234`
3. Dial `1001` (or any number matching the dialplan pattern `^(\+?\d+)$`)

### Option C: Physical Phone

1. Configure your IP phone to register with FreeSWITCH
2. Extension: `1000`, Password: `1234`, Server: `your-fs-ip:5060`
3. Dial any number — the dialplan routes to the AI agent

---

## Expected Log Output

During a successful call, you should see these debug stage markers:

```
STAGE[CALL RECEIVED] Call abc123: Incoming from 1000 -> 1001
STAGE[CALL ANSWERED] Call abc123: Answered, starting AI conversation
STAGE[CALL RECEIVED] Call abc123 from 1000

# Greeting plays
STAGE[TTS START] Call abc123: Synthesizing response...
STAGE[TTS COMPLETE] Call abc123: Synthesized 34281 bytes
STAGE[TTS/AUDIO SENT] Call abc123: Response played to caller

# User speaks
STAGE[AUDIO RECEIVED] Call abc123: Audio recorded (2.3s)
STAGE[STT START] Call abc123: Transcribing 44100 bytes...
STAGE[STT COMPLETE] Call abc123: Transcribed 'Hi, I'd like to know more about your product'
STAGE[LLM START] Call abc123: Processing through LLM...
STAGE[LLM COMPLETE] Call abc123: LLM response (156 chars)
STAGE[TTS START] Call abc123: Synthesizing response...
STAGE[TTS COMPLETE] Call abc123: Synthesized 28500 bytes
STAGE[TTS/AUDIO SENT] Call abc123: Response played to caller

# Call ends
STAGE[CALL ENDED] Call abc123: Conversation ended after 4 turns (45.2s)
STAGE[CALL ENDED] Call abc123: Hangup event received
STAGE[CALL CLEANUP] Call abc123: Marked completed (45.2s, 4 turns)
```

---

## Verification Checkpoints Summary

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | FreeSWITCH running | `fs_cli -x "status"` | "UP 0 min, 0 sec" |
| 2 | Ollama running | `curl :11434/api/tags` | JSON with model list |
| 3 | ESL connected | `curl :8000/health/freeswitch` | `"esl_connected":true` |
| 4 | STP working | `curl :8000/health/stt` | `"status":"ok"` |
| 5 | LLM working | `curl :8000/health/llm` | `"status":"ok"` |
| 6 | TTS working | `curl :8000/health/tts` | `"status":"ok"` |
| 7 | Provider pipeline | `curl :8000/health` | All providers listed |
| 8 | E2E smoke test | `python telephony/scripts/e2e_call_test.py` | PASS on all checks |

---

## Troubleshooting

### ESL Connection Refused
```
STAGE[ESL CONNECT] Connecting to FreeSWITCH ESL at 127.0.0.1:8021 ... FAILED
```
**Fix:** Ensure FreeSWITCH is running and ESL is enabled:
```xml
<!-- In FreeSWITCH conf/autoload_configs/event_socket.conf.xml -->
<param name="listen-ip" value="127.0.0.1"/>
<param name="listen-port" value="8021"/>
<param name="password" value="ClueCon"/>
```

### STT Fails (Whisper not loaded)
```
STAGE[STT FAIL] ...
```
**Fix:** Check GPU/CUDA compatibility:
```bash
python -c "import faster_whisper; print(faster_whisper.__version__)"
```

### TTS Produces Empty Audio
```
STAGE[TTS COMPLETE] Synthesized 0 bytes
```
**Fix:** Check Kokoro model is loaded:
```bash
python -c "from app.providers.tts import KokoroTTSProvider; t = KokoroTTSProvider(); print('OK')"
```

### No Audio Heard on Call
- Check `uuid_broadcast` works: `fs_cli -x "uuid_broadcast <uuid> file:///tmp/fs_test.wav aleg"`
- Verify audio file exists in the path
- Check FreeSWITCH can read the file (permissions)
- Test with a known-good WAV file: `fs_cli -x "originate user/1000 &playback(/tmp/fs_test.wav)"`

---

## Post-Call Cleanup

After testing:

1. Stop the backend (Ctrl+C)
2. Stop FreeSWITCH: `fs_cli -x "fsctl shutdown"`
3. Clean temp audio: `rm -rf tmp_fs_audio/*`

---

## Quick Start (All-in-One)

```bash
# Terminal 1: FreeSWITCH (Windows)
net start FreeSWITCH

# Terminal 2: Ollama
ollama serve

# Terminal 3: Backend
cd C:\ai-sales-agent\backend
set FREESWITCH_BRIDGE_ENABLED=true
python -m uvicorn app.main:app --port 8000

# Terminal 4: Validate
python C:\ai-sales-agent\telephony\scripts\e2e_call_test.py
```
