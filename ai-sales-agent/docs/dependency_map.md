# AI Sales Agent — Dependency Map & Status (June 13, 2026)

## Pipeline: Human → Phone Call → AI Response

```
Human Speech
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ INPUT PATH: How audio enters the system                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  A) Browser Voice Chat (WebSocket)                               ⚠️ │
│     Mic → getUserMedia → ScriptProcessor → WAV encode              │
│     → WebSocket → ws_voice.py → bytes                              │
│     STATUS: Partially Working (needs user to allow mic in Chrome)   │
│                                                                     │
│  B) Twilio Phone Call (PSTN)                                     ❌ │
│     Phone → Twilio SIP Trunk → /twilio/incoming → TwiML            │
│     → /twilio/gather → SpeechResult → text                         │
│     STATUS: Broken (no SIP trunk configured)                        │
│                                                                     │
│  C) FreeSWITCH Call (SIP)                                        ❌ │
│     Phone → SIP Provider → FreeSWITCH → ESL events                 │
│     → bridge_service.py → call_handler.py → audio file              │
│     STATUS: Broken (FreeSWITCH not running on host, ESL unreachable)│
│                                                                     │
│  D) LiveKit Call (WebRTC)                                        ❌ │
│     Phone → LiveKit SIP → LiveKit Room → voice_agent.py            │
│     STATUS: Broken (LiveKit not deployed)                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI PIPELINE: What processes the audio                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  STT (Speech-to-Text)                                           ✅  │
│   ├── whisper.py (faster-whisper, tiny model)                      │
│   │   └── .wav suffix fix applied — working                         │
│   ├── deepgram.py (cloud, optional)                                │
│   │   └── API key configured — working                              │
│   └── VAD filter enabled by default                                 │
│                                                                     │
│  LLM (Language Model)                                           ✅  │
│   ├── ollama.py (qwen2.5:1.5b, local)                              │
│   ├── openai.py (gpt-4o-mini, API key set)                         │
│   └── All providers registered and health-checked                   │
│                                                                     │
│  TTS (Text-to-Speech)                                           ✅  │
│   ├── kokoro.py (local, af_bella voice)                             │
│   │   └── Audio cache working (files in data/audio/cache/)          │
│   └── elevenlabs.py (cloud, API key set)                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ ORCHESTRATION: Routes and services                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  FastAPI Backend (main.py)                                      ✅  │
│   ├── health endpoint responding                                    │
│   ├── CORS configured                                               │
│   ├── Rate limiting enabled                                         │
│   └── All routers mounted                                           │
│                                                                     │
│  Conversation Service                                           ✅  │
│   ├── In-memory state management                                    │
│   ├── TTL-based cleanup active                                      │
│   ├── Sentiment analysis working                                    │
│   └── LLM turn processing working                                   │
│                                                                     │
│  Voice Pipeline                                                 ✅  │
│   ├── STT → LLM → TTS flow working                                  │
│   ├── Audio cache integrated                                        │
│   └── State engine available                                        │
│                                                                     │
│  WebSocket Bridge (ws_voice.py)                                ⚠️  │
│   ├── Bugs fixed: .wav suffix, import time                          │
│   ├── Error messages sent to client                                 │
│   └── Edge case: disconnect handling still fragile                  │
│                                                                     │
│  Twilio Webhooks (twilio_webhooks.py)                           ⚠️  │
│   ├── Incoming/gather/status routes coded                           │
│   ├── SMS → voice callback coded                                    │
│   └── NOT TESTED — requires SIP trunk + public URL                  │
│                                                                     │
│  FreeSWITCH Bridge (bridge_service.py)                          ❌  │
│   ├── ESL client connects (auth works)                              │
│   ├── Event handlers registered                                     │
│   ├── VAD-based recording loop coded                                │
│   └── NOT RUNNING — ESL port unreachable                            │
│                                                                     │
│  LiveKit Agent (voice_agent.py)                                 ❌  │
│   ├── Worker entrypoint coded                                       │
│   ├── Provider adapters coded                                       │
│   └── NOT DEPLOYED — LiveKit server needed                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ OUTPUT PATH: How AI response reaches human                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  A) Browser (WebSocket)                                         ⚠️  │
│     TTS audio → base64 → WebSocket → AudioContext → speakers       │
│     STATUS: Working (if browser allows audio)                       │
│                                                                     │
│  B) Twilio (Phone)                                              ❌  │
│     TTS audio → TwiML <Say> → Phone speaker                        │
│     STATUS: Blocked (no SIP trunk)                                  │
│                                                                     │
│  C) FreeSWITCH (SIP)                                            ❌  │
│     TTS audio → WAV file → uuid_broadcast → Phone speaker          │
│     STATUS: Blocked (FreeSWITCH not running)                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Paths to First Successful Call

### FASTEST PATH: Browser Voice Chat (Estimated: 2 minutes)
```
Human → Browser Mic → WAV → WebSocket → STT → LLM → TTS → WebSocket → Speakers
```
**Status:** 🟡 ONE STEP AWAY
- ✅ All AI providers working (STT, LLM, TTS)
- ✅ Backend running (port 8000)
- ✅ Voice chat page served (/frontend/voice-chat.html)
- ✅ WebSocket connects (status shows "Connected")
- ✅ Chrome mic block removed (was blocked, now cleared)
- ❌ **BOTTLENECK:** User needs to open link, click mic, and ALLOW mic permission
- **Action:** Click button, click "Allow" when Chrome prompts

### CRITICAL PATH: Production Phone Call (Estimated: 2-4 hours)
```
Human → Phone → SIP Provider → Twilio → Webhook → STT → LLM → TTS → TwiML → Phone
```
- **Missing:** SIP trunk provisioning (~30 min)
- **Missing:** Public HTTPS URL for Twilio webhooks (~30 min, ngrok or domain)
- **Missing:** Twilio phone number configured (~15 min)
- **Total delta from working AI pipeline:** ~1-2 hours

### PRODUCTION PATH: Self-hosted FreeSWITCH + SIP (Estimated: 1-3 days)
```
Human → Phone → SIP Provider → FreeSWITCH → ESL → Backend → STT → LLM → TTS → WAV → Broadcast → Phone
```
- **Blocked:** FreeSWITCH native on WSL (build failed, extracting from Docker failed)
- **Alternative:** Docker-based FreeSWITCH (working, ESL port open)
- **Missing:** SIP trunk account (Plivo/Twilio/etc.)
- **Missing:** Public IP / domain for SIP registration

## Current Bottleneck Analysis

### BOTTLENECK #1 (IMMEDIATE)
**Component:** Browser Microphone Permission
**Status:** 🔴 BLOCKING
**Root Cause:** Chrome had `http://localhost:8000` in its blocked mic list. Now cleared, but the user hasn't tested yet.
**Fix:** Open link, click mic button, click "Allow" when Chrome prompts.

### BOTTLENECK #2 (NEXT)
**Component:** Phone Call Routing
**Status:** 🔴 BLOCKING
**Root Cause:** No SIP trunk provider configured. Twilio webhook endpoint requires a public HTTPS URL.
**Fix:** 
- Option A: Twilio (+$2/mo phone number, pay-per-minute) 
  - Configure SIP trunk with Twilio Elastic SIP Trunk
  - Use ngrok or deploy to VPS for public webhook URL
  - Estimated: 1-2 hours
- Option B: Plivo (+$2/mo phone number, pay-per-minute)
  - Similar setup, slightly cheaper per minute
  - Estimated: 1-2 hours

### BOTTLENECK #3 (STRETCH)
**Component:** FreeSWITCH Native Installation
**Status:** ⚠️ DEGRADED
**Root Cause:** v1.10.12 source incompatible with Ubuntu 24.04 libraries
**Workaround:** Docker-based FreeSWITCH works (ESL port 8021 responds)
**Fix for native:** Use SignalWire apt repo with PAT
**ETA:** 30-60 minutes once PAT is provided

## Running Services Status (Current)

| Service | Port | Status | Component |
|---------|------|--------|-----------|
| FastAPI Backend | 8000 | ✅ | Orchestration |
| Ollama (qwen2.5:1.5b) | 11434 | ✅ | LLM |
| Redis | 6379 | ✅ | Cache/Persistence |
| FreeSWITCH ESL | 8021 | ❌ (not running) | Telephony Bridge |
| Chrome Mic Permission | - | ✅ (cleared) | Input |
| Frontend Voice Chat | /frontend/voice-chat.html | ✅ | UI |

## Summary

The **AI pipeline (STT → LLM → TTS) is fully working** on this WSL stack. All the code bugs have been fixed (missing import, wrong audio suffix, indentation). The only missing piece for the FIRST SUCCESSFUL CALL is:

1. **You opening the link** and clicking "Allow" on the mic permission
2. **Speaking into the mic** to test the browser voice chat

Once that's confirmed, the next step to a **real phone call** is:
1. Sign up for Twilio (or Plivo)
2. Get a phone number
3. Use ngrok or deploy to expose the webhook
4. Configure the Twilio SIP trunk
