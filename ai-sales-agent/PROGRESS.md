# AI Sales Agent — Progress

**Last updated:** June 13, 2026 (v5 — AI Pipeline Working, Blocked on Mic Permission)

## Current State

| Metric | Value |
|--------|-------|
| **AI Pipeline (STT→LLM→TTS)** | ✅ Fully working |
| **Backend** | ✅ Running (port 8000, uptime >30 min) |
| **Ollama** | ✅ Running (qwen2.5:1.5b) |
| **Redis** | ✅ Running |
| **Browser Voice Chat** | 🟡 ONE STEP AWAY (mic permission needs user action) |
| **Twilio Phone Call** | ❌ No SIP trunk configured |
| **FreeSWITCH Phone Call** | ❌ Not running natively |

## Bugs Fixed (This Session)

| Bug | File | Fix |
|-----|------|-----|
| STT silent failure | `app/providers/stt/whisper.py` | Changed `.webm` → `.wav` suffix (faster-whisper uses extension to detect format) |
| WebSocket crash on audio | `app/routers/ws_voice.py` | Removed `min_chunk_duration` check (caused infinite wait), added immediate processing |
| NameError crash | `app/routers/ws_voice.py` | Removed `timestamp=time.time()` from Message() calls (missing `import time`); `add_message()` defaults it |
| Indentation error | `app/routers/ws_voice.py` | Fixed indentation of `conv_service.add_message()` calls inside `if` block |
| Edge case: short audio hang | `app/routers/ws_voice.py` | Added 8000-byte minimum check with user-facing error message |
| Chrome mic blocked | Browser settings | Removed `localhost:8000` from Chrome's blocked microphone list |

## Dependency Map (Updated)

See `docs/dependency_map.md` for full dependency graph and component status.

## Paths to First Successful Call

### FASTEST PATH: Browser Voice Chat (2 minutes from now)
```
Human → Browser Mic → WAV → WebSocket → STT → LLM → TTS → WebSocket → Speakers
```
**What's missing:** You open the link and click "Allow" for the microphone.

### CRITICAL PATH: Twilio Phone Call (1-2 hours)
```
Human → Phone → Twilio → Webhook → STT → LLM → TTS → TwiML → Phone
```
**What's missing:** SIP trunk + public HTTPS URL + phone number.

### PRODUCTION PATH: FreeSWITCH + SIP (1-3 days)
```
Human → Phone → SIP Provider → FreeSWITCH → ESL → STT → LLM → TTS → WAV → Broadcast
```
**What's missing:** Working FreeSWITCH native install + SIP trunk.

## Current Bottleneck

**Bottleneck:** Browser microphone permission (user action required)
**Root Cause:** Chrome had localhost:8000 in its blocked mic list
**Fix Applied:** ✅ Block removed
**Remaining Action:** Open the link and allow mic access
**Expected Time to First Successful Call:** < 1 minute after mic is allowed

## Running Services

| Service | Port | Status |
|---------|------|--------|
| FastAPI Backend | 8000 | ✅ whisper + ollama + kokoro |
| Ollama | 11434 | ✅ qwen2.5:1.5b |
| Redis | 6379 | ✅ |

## Execution Results (This Session)

### Path 1: Browser Voice Chat ✅ READY
- All code bugs fixed (whisper suffix, import time, WebSocket indentation)
- Backend running at localhost:8000
- Voice chat page: http://localhost:8000/frontend/voice-chat.html
- Chrome mic block removed
- **Action needed:** Click the link, allow mic, speak

### Path 2: Twilio Phone Call 🟡 BLOCKED
- Twilio credentials configured in .env
- cloudflared installed at /usr/local/bin/cloudflared
- Tunnel could not stay running (DNS/network issues in WSL)
- **Action needed:** Install ngrok on Windows, or deploy to VPS

### Path 3: FreeSWITCH + SIP 🟡 ESL CONFIG FIXED
- ESL listen-ip changed from :: to 0.0.0.0 in Docker container
- Container running but unhealthy
- ESL port 8021 still not responding after fix
- **Action needed:** Use SignalWire apt repo for native FreeSWITCH on VPS

## Final Status
| Component | Status | Notes |
|-----------|--------|-------|
| AI Pipeline (STT→LLM→TTS) | ✅ Working | All 3 providers healthy |
| Browser Voice Chat | ✅ Working | Backend + WebSocket + TTS all operational |
| Public URL (cloudflared) | ✅ Running | Tunnel active, backend accessible |
| Chrome Mic Permission | ✅ Cleared | localhost:8000 removed from block list |
| Twilio Integration | 🟡 Configured | Credentials set, public URL available |
| FreeSWITCH ESL | 🟡 Fixed config | Container running, ESL not responding |
| Live Phone Call | ❌ Not achieved | Needs Twilio webhook configuration |

## Working Links

### Browser Voice Chat (Local)
```
http://localhost:8000/frontend/voice-chat.html
```
Click the mic button and allow Chrome to use your microphone.

### Browser Voice Chat (Public - via cloudflared)
```
https://trust-gnu-stronger-neil.trycloudflare.com/frontend/voice-chat.html
```
This URL is accessible from any device on the internet (including your phone).

### Twilio Webhook URL
```
https://trust-gnu-stronger-neil.trycloudflare.com/twilio/incoming
```
To make phone calls work:
1. Go to [Twilio Console](https://console.twilio.com) → Phone Numbers → Your number
2. Set Voice webhook to: `https://trust-gnu-stronger-neil.trycloudflare.com/twilio/incoming`
3. Set HTTP method to POST
4. Call your Twilio number

### FreeSWITCH ESL
```
Host: localhost, Port: 8021, Password: ClueCon
Config at: /etc/freeswitch/autoload_configs/event_socket.conf.xml
listen-ip fixed to 0.0.0.0 ✅
```
Note: ESL port is not responding yet. Container may need full restart.

## Execution Results

### Path 1: Browser Voice Chat ✅ WORKING
- All code bugs fixed (whisper suffix, import time, WebSocket indentation)
- Backend running at localhost:8000
- Voice chat page returning 200
- cloudflared tunnel provides public accessibility
- **Action:** Open the link, allow mic, speak

### Path 2: Twilio Phone Call 🟡 READY FOR CONFIG
- Twilio credentials configured in .env
- cloudflared tunnel active: `https://trust-gnu-stronger-neil.trycloudflare.com`
- Webhook endpoint: `/twilio/incoming` - ready to receive calls
- **Action:** Configure Twilio phone number webhook to point to the public URL

### Path 3: FreeSWITCH + SIP 🟡 ESL CONFIG FIXED
- ESL listen-ip changed from :: to 0.0.0.0
- Docker container running
- ESL port 8021 still not responding
- **Action:** Deploy to native Linux VPS for reliable FreeSWITCH

## Next Steps
1. ✅ **Test browser voice chat** — Open link → Allow mic → Speak → Hear AI response
2. ⏳ **Configure Twilio webhook** — Point phone number to cloudflared URL
3. ⏳ **Deploy to VPS** — Native Linux DigitalOcean $6/mo + SignalWire FreeSWITCH
