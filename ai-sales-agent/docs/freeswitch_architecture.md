# FreeSWITCH Integration — Architecture

## Overview

The FreeSWITCH integration connects the AI Sales Agent voice pipeline to the Public Switched Telephone Network (PSTN) through FreeSWITCH, an open-source telephony platform. This enables real, phone-based conversations with the AI voice agent over SIP trunks or analog lines.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        PSTN / SIP Trunk                          │
│          (Twilio, Telnyx, Flowroute, or direct SIP)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  FreeSWITCH  │
                    │  (SIP Server) │
                    │              │
                    │  • SIP       │
                    │  • RTP Audio │
                    │  • Dialplan  │
                    │  • ESL       │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              │  ┌─────────▼──────┐     │
              │  │  ESL (Port     │     │
              │  │  8021)         │     │
              │  │  Event Socket  │     │
              │  └─────────┬──────┘     │
              │            │            │
     ┌────────▼────────┐  │  ┌─────────▼─────────┐
     │  AI Bridge       │  │  │  HTTP REST API     │
     │  Service         │  │  │  (mod_xml_curl /   │
     │  (ESL Client)    │  │  │   dialplan curl)   │
     │  telephony/      │  │  │  telephony/        │
     │  freeswitch/     │  │  │  freeswitch/       │
     │  bridge_service  │  │  │  http_api.py       │
     └────────┬────────┘  │  └──────────┬──────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │  FastAPI     │
                    │  (Backend)   │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼──────┐   ┌─────▼──────┐
    │  STT       │   │  LLM       │   │  TTS        │
    │  (Whisper) │   │  (Qwen)    │   │  (Kokoro)   │
    └───────────┘   └────────────┘   └────────────┘
```

## Call Flow

### 1. Inbound Call (Full ESL Bridge Mode)

```
Caller dials number
       │
       ▼
SIP Trunk → FreeSWITCH
       │
       ▼
FreeSWITCH creates channel, runs dialplan
       │
       ▼
Dialplan answers call and parks it
       │
       ▼
FreeSWITCH sends CHANNEL_CREATE → ESL
       │
       ▼
FreeSWITCH sends CHANNEL_ANSWER → ESL
       │
       ▼
AI Bridge Service receives event via ESL
       │
       ▼
Bridge creates ConversationState + CallHandler
       │
       ▼
CallHandler starts conversation loop:
  ┌─────────────────────────────────────┐
  │  1. Play greeting (TTS)            │
  │  2. Record caller speech           │
  │  3. STT → Transcribe audio         │
  │  4. LLM → Generate response        │
  │  5. TTS → Synthesize audio         │
  │  6. Play TTS to caller             │
  │  7. Repeat from step 2             │
  └─────────────────────────────────────┘
       │
       ▼
Caller hangs up or says goodbye
       │
       ▼
CHANNEL_HANGUP event → Cleanup
```

### 2. Inbound Call (HTTP Bridge Mode)

```
Caller dials number
       │
       ▼
SIP Trunk → FreeSWITCH
       │
       ▼
Dialplan (default.xml) executes:
       │
       ├── POST /fs/incoming  →  Creates conversation, returns greeting
       │
       ├── (Loop)
       │   ├── Record caller audio (FreeSWITCH native record)
       │   ├── POST /fs/process  →  STT → LLM → TTS, returns audio
       │   └── Play TTS response to caller
       │
       └── POST /fs/hangup  →  Ends conversation
```

## Audio Flow

```
Caller's Voice
       │
       ▼
FreeSWITCH records to WAV file (8kHz or 16kHz, mono)
       │
       ▼
AI Bridge reads WAV file bytes
       │
       ▼
VoicePipeline.synthesize_response() → TTS audio bytes
       │
       ▼
AI Bridge writes TTS bytes to WAV file
       │
       ▼
FreeSWITCH plays WAV file to caller via uuid_broadcast
```

### Audio Specifications for FreeSWITCH

| Parameter | Value |
|-----------|-------|
| Sample Rate | 8,000 Hz (telephony) or 16,000 Hz |
| Bit Depth | 16-bit signed PCM |
| Channels | 1 (mono) |
| Format | WAV |
| Codec | PCMU (G.711 μ-law) for PSTN |
| Codec | Opus for SIP-to-SIP calls |

## STT Flow

```
FreeSWITCH recording (WAV)
       │
       ▼
CallHandler._read_audio(file_path) → bytes
       │
       ▼
STTProvider.transcribe(audio_bytes, language="en")
       │
       ▼
  ┌────┴────┐
  │ Whisper │  (Local, faster-whisper)
  │ or      │
  │ Deepgram│  (Cloud, optional)
  └────┬────┘
       │
       ▼
Transcription text string
```

## TTS Flow

```
LLM response text
       │
       ▼
TTSProvider.synthesize(text, voice_id)
       │
       ▼
  ┌────┴────┐
  │ Kokoro  │  (Local, lightweight)
  │ or      │
  │ Eleven  │  (Cloud, premium)
  └────┬────┘
       │
       ▼
Audio bytes (WAV/PCM)
       │
       ▼
Write to file in tmp_fs_audio/
       │
       ▼
uuid_broadcast to FreeSWITCH call leg
```

## Key Components

### `telephony/freeswitch/esl_client.py`
Pure Python Event Socket Library client. No external dependencies.
- Connects to FreeSWITCH ESL port (default 8021)
- Authenticates with password
- Subscribes to events (CHANNEL_CREATE, CHANNEL_ANSWER, CHANNEL_HANGUP, etc.)
- Sends API commands (uuid_record, uuid_broadcast, uuid_kill, etc.)
- Async event dispatch to registered handlers

### `telephony/freeswitch/call_handler.py`
Per-call lifecycle manager.
- Creates ConversationState in the conversation service
- Runs the record → STT → LLM → TTS → playback loop
- Detects end-call phrases (goodbye, bye, etc.)
- Manages turn counting and LLM timeout
- Cleans up audio files after each turn

### `telephony/freeswitch/bridge_service.py`
Top-level orchestrator.
- Connects to FreeSWITCH ESL with retry logic
- Subscribes to events and dispatches to handlers
- Creates CallHandler instances for each answered call
- Manages active call tracking and cleanup
- Runs keepalive ping to maintain connection
- Provides health/status reporting

### `telephony/freeswitch/http_api.py`
Alternative REST integration path.
- FastAPI router with `/fs/*` endpoints
- Designed for FreeSWITCH dialplan using `mod_curl` or `mod_xml_curl`
- Processes audio via the same VoicePipeline
- Stateless (no ESL connection required)

### Reused Components (from `backend/`)

| Component | File | Usage in FS Integration |
|-----------|------|------------------------|
| VoicePipeline | `backend/app/voice/pipeline.py` | STT → LLM → TTS orchestration |
| STT Providers | `backend/app/providers/stt/` | Speech transcription |
| LLM Providers | `backend/app/providers/llm/` | Response generation |
| TTS Providers | `backend/app/providers/tts/` | Speech synthesis |
| ConversationService | `backend/app/services/conversation.py` | Conversation state + history |
| Settings | `backend/app/config.py` | App-wide configuration |
| Message Schema | `backend/app/models/schemas.py` | Data models |

## Two Integration Modes

### ESL Bridge Mode (Recommended)
- **Pro**: Full control, real-time events, lower latency
- **Pro**: Can manage multiple concurrent calls
- **Pro**: Access to all FreeSWITCH features (conferencing, DTMF, etc.)
- **Con**: Requires ESL connection to FreeSWITCH
- **Con**: Must run alongside FreeSWITCH

### HTTP REST Mode (Simpler)
- **Pro**: No ESL dependency
- **Pro**: Works with any FreeSWITCH deployment
- **Pro**: Easy to test with curl/HTTP clients
- **Con**: Higher latency per turn (file I/O + HTTP round-trip)
- **Con**: Less control over call state

## Future Scalability

### Short-term (Current Phase)
- Single concurrent call
- ESL connection with automatic retry
- Basic call state tracking
- File-based audio transfer

### Medium-term
- Multiple concurrent calls with per-call handlers
- Audio streaming via RTP instead of file I/O
- Barge-in detection (interrupt TTS playback when caller speaks)
- DTMF key handling for menu navigation
- Call queue and load balancing

### Long-term
- Horizontal scaling: multiple FreeSWITCH instances behind a load balancer
- Redis-backed distributed call state
- GPU-accelerated batch STT processing
- Warm standby bridge services for HA
- WebRTC fallback via LiveKit integration

## Dependencies

### Required
- Python 3.10+
- FreeSWITCH 1.10+ (with mod_event_socket loaded)
- AI backend running (FastAPI)

### FreeSWITCH Modules
```
mod_event_socket    — ESL server (mandatory)
mod_sofia           — SIP stack (mandatory)
mod_dptools         — Record/playback (mandatory)
mod_curl            — HTTP integration (optional, for HTTP mode)
mod_xml_curl        — Dynamic dialplan (optional)
```

### Configuration Files

| File | Purpose |
|------|---------|
| `telephony/configs/freeswitch/dialplan/default.xml` | Dialplan routing calls to AI |
| `telephony/configs/freeswitch/sip_profiles/internal.xml` | SIP profile with codec settings |
| `telephony/configs/freeswitch/ai_bridge.xml` | Bridge connection settings |
| `telephony/freeswitch/config.py` | Python-side configuration |

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 5060 | UDP/TCP | SIP signalling |
| 8021 | TCP | Event Socket (ESL) |
| 16384-32768 | UDP | RTP media (dynamic range) |
| 8000 | TCP | AI backend HTTP API |
