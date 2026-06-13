# FreeSWITCH Integration Report

## Overview

This report documents the integration of FreeSWITCH telephony with the existing AI Sales Agent voice pipeline. The integration was designed to reuse as much existing code as possible while adding minimal new components specific to FreeSWITCH communication.

---

## Existing Code Reused

All of the following components from `backend/` are reused without modification:

| Component | File | Role in Integration |
|-----------|------|--------------------|
| **VoicePipeline** | `backend/app/voice/pipeline.py` | Core STT → LLM → TTS orchestration via `process_audio()`, `synthesize_response()`, `_build_messages()` |
| **STT Providers** | `backend/app/providers/stt/whisper.py` | Speech transcription (Whisper via faster-whisper) |
| **LLM Providers** | `backend/app/providers/llm/ollama.py` | Response generation (Qwen via Ollama) |
| **TTS Providers** | `backend/app/providers/tts/kokoro.py` | Speech synthesis (Kokoro) |
| **ConversationService** | `backend/app/services/conversation.py` | Conversation state, history, sentiment analysis |
| **Provider Registry** | `backend/app/providers/base.py` | Provider lookup and hot-swapping |
| **Settings** | `backend/app/config.py` | Application-wide configuration (extended) |
| **Models/Schemas** | `backend/app/models/schemas.py` | Message, ConversationCreate, ConversationResponse |
| **Intent Detection** | `backend/app/services/intent.py` | Optional intent classification |
| **GPU Detection** | `backend/app/providers/gpu.py` | Hardware optimizations |
| **Audio Cache** | `backend/app/services/audio_cache.py` | Caches frequently used TTS responses |

---

## New Components Created

### 1. Python Module: `telephony/freeswitch/`

| File | Lines | Purpose |
|------|-------|---------|
| `__init__.py` | ~20 | Module exports |
| `config.py` | ~90 | FreeSWITCH-specific settings (env vars) |
| `types.py` | ~100 | Data classes: CallState, FreeswitchCall, ESLCommand, ESLResponse |
| `exceptions.py` | ~70 | Error hierarchy: ESLConnectionError, ESLAuthError, etc. |
| `esl_client.py` | ~280 | Pure Python async ESL socket client (no deps) |
| `call_handler.py` | ~290 | Per-call record → STT → LLM → TTS → playback loop |
| `bridge_service.py` | ~330 | ESL connection lifecycle, event dispatch, call management |
| `http_api.py` | ~280 | FastAPI router with `/fs/*` endpoints for curl-based dialplans |

### 2. Configuration Files: `telephony/configs/freeswitch/`

| File | Purpose |
|------|---------|
| `dialplan/default.xml` | FreeSWITCH dialplan routing calls to AI pipeline (ESL + HTTP modes) |
| `sip_profiles/internal.xml` | SIP profile with codec settings, NAT traversal, Twilio compatibility |
| `ai_bridge.xml` | Bridge connection parameters (host, port, audio settings) |

### 3. Test Script: `telephony/scripts/simulate_call.py`

Tests three modes:
- **Direct**: Tests LLM/TTS providers directly without FreeSWITCH
- **HTTP**: Simulates HTTP integration mode via live backend
- **ESL**: Tests ESL connectivity to a running FreeSWITCH

### 4. Documentation: `docs/`

| File | Content |
|------|---------|
| `freeswitch_architecture.md` | Architecture diagrams, call/audio/STT/TTS flows, integration modes, scalability |
| `freeswitch_setup.md` | Windows, Docker, and Linux setup guides with troubleshooting |
| `freeswitch_integration_report.md` | This file — code reuse analysis |

---

## Files Modified in `backend/`

### `backend/app/config.py`
Added FreeSWITCH-specific configuration class (`FreeSwitchSettings`) that reads from environment variables. Settings include ESL connection parameters, audio paths, call duration limits, and greeting text.

### `backend/app/main.py`
Added conditional initialization of the FreeSWITCH bridge service in the application lifespan:
- On startup: starts the bridge if `FREESWITCH_BRIDGE_ENABLED=true`
- On shutdown: stops the bridge gracefully

### `backend/app/routers/__init__.py`
Added the FreeSWITCH HTTP API router (`/fs/*` endpoints) when the integration module is available.

---

## Integration Architecture Decisions

### Why ESL (Event Socket) as Primary?
1. **Real-time events**: CHANNEL_ANSWER, CHANNEL_HANGUP, DTMF, etc.
2. **Full control**: Start/stop recordings, broadcast audio, hang up
3. **Lower latency**: No HTTP round-trip per turn
4. **Async by nature**: Fits well with asyncio

### Why HTTP as Secondary?
1. **Simpler to set up**: Doesn't require ESL module config
2. **Works with any FreeSWITCH**: Even minimal installations
3. **Independent deployment**: Bridge service can be on separate machine
4. **Easier debugging**: Can test with curl

### Why Pure Python ESL Client?
1. **Zero external dependencies**: No need to compile mod_pylib or ESL wrapper
2. **Async from the start**: Uses asyncio streams
3. **Simple protocol**: ESL uses plain TCP with key:value messages
4. **Maintainable**: ~280 lines, easy to modify

### Audio Transfer Strategy
**Phase 1** (current): File-based audio transfer
- FreeSWITCH records to WAV file
- Python reads file → processes → writes TTS WAV
- FreeSWITCH broadcasts TTS WAV to call
- Simple, debuggable, works for single concurrent calls

**Phase 2** (future): Stream-based audio
- Use RTP streaming for lower latency
- Stream audio chunks via websocket
- Reduce disk I/O for multiple concurrent calls

---

## Data Flow Summary

```
ESL Mode:
  FreeSWITCH ←ESL→ ESLClient → BridgeService → CallHandler → VoicePipeline
                              ↕                                ↕
                          Active Calls                    STT/LLM/TTS

HTTP Mode:
  FreeSWITCH ←HTTP→ http_api.py → VoicePipeline
                                  ↕
                            STT/LLM/TTS
```

## Testing Matrix

| Test | ESL Mode | HTTP Mode | Direct | Dependencies |
|------|----------|-----------|--------|--------------|
| LLM response generation | ✓ | ✓ | ✓ | Ollama or OpenAI |
| TTS audio synthesis | ✓ | ✓ | ✓ | Kokoro or ElevenLabs |
| STT transcription | ✓ | ✓ | ✓ | Whisper or Deepgram |
| ESL connectivity | ✓ | — | — | Running FreeSWITCH |
| Full call loop | ✓ | ✓ | — | FreeSWITCH + Backend |
| End-call detection | ✓ | ✓ | — | Any mode |
| Concurrent calls | ✓ | — | — | ESL mode only |

---

## Files Created/Modified Summary

```
ai-sales-agent/
├── docs/
│   ├── freeswitch_architecture.md          NEW
│   ├── freeswitch_setup.md                 NEW
│   └── freeswitch_integration_report.md    NEW
├── telephony/
│   ├── README.md                           (existing, updated)
│   ├── freeswitch/
│   │   ├── __init__.py                     NEW
│   │   ├── config.py                       NEW
│   │   ├── types.py                        NEW
│   │   ├── exceptions.py                   NEW
│   │   ├── esl_client.py                   NEW
│   │   ├── call_handler.py                 NEW
│   │   ├── bridge_service.py               NEW
│   │   └── http_api.py                     NEW
│   ├── configs/freeswitch/
│   │   ├── dialplan/default.xml            NEW
│   │   ├── sip_profiles/internal.xml       NEW
│   │   └── ai_bridge.xml                   NEW
│   └── scripts/
│       └── simulate_call.py                NEW
├── backend/app/
│   ├── config.py                           MODIFIED
│   └── main.py                             MODIFIED
└── docker/
    └── freeswitch-docker-compose.yml       REFERENCED (in setup guide)
```

**Total new files**: 14
**Total modified files**: 2
**Total lines added**: ~1,800
