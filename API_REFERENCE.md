# VoiceAI Orchestrator — API Reference

> **Base URL:** `http://localhost:8000`  
> **Auth:** JWT Bearer token (`Authorization: Bearer <token>`)  
> **Content-Type:** `application/json` (unless otherwise noted)

---

## Table of Contents

1. [System & Health](#1-system--health)
2. [Voice Processing](#2-voice-processing)
3. [WebSocket Voice](#3-websocket-voice)
4. [Conversations](#4-conversations)
5. [Calls](#5-calls)
6. [Agents](#6-agents)
7. [Knowledge Base / RAG](#7-knowledge-base--rag)
8. [SIP / Telephony](#8-sip--telephony)
9. [Social Automation](#9-social-automation)
10. [Voice Profiles](#10-voice-profiles)
11. [Twilio Webhooks](#11-twilio-webhooks)
12. [Monitoring & Metrics](#12-monitoring--metrics)
13. [Runtime Status](#13-runtime-status)

---

## 1. System & Health

### `GET /health`
Health check endpoint. Returns server status, version, uptime, and registered providers.

**Response `200`:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 1234.5,
  "providers": {
    "stt": ["whisper", "deepgram", "assemblyai"],
    "llm": ["ollama", "openai"],
    "tts": ["kokoro", "elevenlabs"]
  }
}
```

### `GET /providers`
List all registered providers with capabilities.

**Response `200`:**
```json
{
  "stt_providers": [
    { "name": "whisper", "supports_streaming": true, "is_available": true },
    { "name": "deepgram", "supports_streaming": true, "is_available": true }
  ],
  "llm_providers": [...],
  "tts_providers": [...],
  "active_stt": "whisper",
  "active_llm": "ollama",
  "active_tts": "kokoro"
}
```

### `POST /providers/switch`
Switch active providers at runtime without restarting.

**Request:**
```json
{
  "stt": "deepgram",
  "llm": "openai",
  "tts": "elevenlabs"
}
```

**Response `200`:**
```json
{
  "message": "Providers updated",
  "active_stt": "deepgram",
  "active_llm": "openai",
  "active_tts": "elevenlabs"
}
```

---

## 2. Voice Processing

### `POST /voice/transcribe`
Transcribe base64-encoded audio to text.

**Request:**
```json
{
  "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAA...",
  "language": "en"
}
```

**Response `200`:**
```json
{
  "text": "Hello, this is a test recording.",
  "provider": "whisper"
}
```

### `POST /voice/complete`
Send messages to the LLM for completion.

**Request:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the weather like?" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024
}
```

**Response `200`:**
```json
{
  "content": "I don't have real-time weather data, but you can check your local forecast.",
  "provider": "ollama",
  "model": "llama3.2"
}
```

### `POST /voice/complete/stream`
Streaming LLM completion via Server-Sent Events.

**Request:** Same as `/voice/complete`  
**Response:** SSE stream with `chunk` and `done` events.

```
event: chunk
data: I

event: chunk
data:  don't

event: chunk
data:  have

event: done
data:
```

### `POST /voice/synthesize`
Synthesize text to speech audio (returns base64-encoded WAV).

**Request:**
```json
{
  "text": "Hello, how can I help you today?",
  "voice_id": "kokoro-default",
  "language": "en",
  "speaking_rate": 1.0,
  "pitch": 0.0
}
```

**Response `200`:**
```json
{
  "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAA...",
  "duration_seconds": 2.4,
  "provider": "kokoro"
}
```

### `POST /voice/process`
Full pipeline: transcribe → detect intent → LLM response.

**Request:**
```json
{
  "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAA...",
  "conversation_id": null,
  "language": "en",
  "system_prompt": null
}
```

**Response `200`:**
```json
{
  "transcription": "I'd like to check my account balance",
  "response": "I'd be happy to help you check your account balance. Could you please verify your account number?",
  "intent": { "name": "account_inquiry", "confidence": 0.89 },
  "conversation_id": "conv_abc123",
  "adaptive": {
    "emotion": "neutral",
    "trust": 5,
    "patience": 5
  },
  "state": null,
  "semantic": null
}
```

### `POST /voice/intent`
Detect intent from text.

**Request:**
```json
{ "text": "I want to speak to a manager" }
```

**Response `200`:**
```json
{
  "intent": "escalation",
  "confidence": 0.76,
  "method": "llm",
  "top_matches": ["escalation", "complaint", "support"]
}
```

### `GET /voice/livekit-token`
Generate a LiveKit access token for browser clients.

**Query Params:**
- `room_name` (optional): Specific room name (auto-generated if omitted)

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "room_name": "voiceai-a1b2c3d4",
  "url": "ws://localhost:7880"
}
```

---

## 3. WebSocket Voice

### `WS /ws/voice`
Real-time voice chat with barge-in support and streaming transcription.

**Protocol:**

| Direction | Type | Description |
|-----------|------|-------------|
| Client → | `binary` | Raw audio chunks (16kHz, 16-bit PCM) |
| Client → | `{"type":"text","text":"..."}` | Text input fallback |
| Client → | `{"type":"interrupt"}` | Explicit barge-in signal |
| Client → | `{"type":"ping"}` | Keep-alive ping |
| Client → | `{"type":"end_call"}` | End the conversation |
| → Server | `{"type":"connected","conversation_id":"..."}` | Connection established |
| → Server | `{"type":"transcription","text":"...","is_final":true}` | STT result |
| → Server | `{"type":"response","text":"...","is_streaming":true}` | LLM chunk |
| → Server | `{"type":"response_done"}` | LLM finished |
| → Server | `{"type":"audio","base64":"..."}` | TTS audio chunk |
| → Server | `{"type":"sentiment","emotion":"...","trust":5,"patience":5}` | Emotional state |
| → Server | `{"type":"state","state":"...","transition_count":3}` | State engine update |
| → Server | `{"type":"interrupt","message":"..."}` | Interrupt confirmation |
| → Server | `{"type":"pong"}` | Pong response |
| → Server | `{"type":"call_ended","summary":{...}}` | Call summary |
| → Server | `{"type":"error","message":"..."}` | Error notification |

---

## 4. Conversations

### `POST /conversations`
Create a new conversation.

**Request:**
```json
{
  "contact_phone": "+14155551234",
  "contact_name": "John Doe",
  "metadata": { "source": "web" }
}
```

### `GET /conversations`
List all conversations.

**Query Params:**
- `active_only` (bool, default `false`)

### `GET /conversations/{id}`
Get a single conversation.

### `POST /conversations/{id}/messages`
Add a message to a conversation.

### `GET /conversations/{id}/messages`
Get recent messages.

**Query Params:**
- `limit` (int, default `10`)

### `PATCH /conversations/{id}/status`
Update conversation status.

**Valid statuses:** `initializing`, `in_progress`, `paused`, `completed`, `failed`

### `GET /conversations/{id}/summary`
Generate a conversation summary.

### `DELETE /conversations/{id}`
Delete a conversation.

---

## 5. Calls

### `POST /calls`
Initiate a new AI voice call. Creates a conversation and generates an initial greeting.

**Request:**
```json
{
  "to": "+14155551234",
  "from_": "+14155558888",
  "contact_name": "Jane Smith",
  "voice_id": "kokoro-default",
  "language": "en",
  "campaign_id": "camp_001",
  "prompt": "You are calling about your recent support ticket.",
  "metadata": {}
}
```

### `POST /calls/{conversation_id}/action`
Perform an action on an active call.

**Actions:** `process_input`, `end`, `pause`, `resume`, `transfer`

**Request (process_input):**
```json
{
  "action": "process_input",
  "user_input": "I need help with my order"
}
```

### `POST /calls/{conversation_id}/input`
Process a text input for an active call.

**Query Params:** `text` (required)

---

## 6. Agents

### `GET /agents`
List all AI agents.

**Query Params:**
- `user_id` (optional): Filter by user
- `active_only` (bool, default `false`)

### `POST /agents`
Create a new agent.

**Request:**
```json
{
  "name": "Support Agent Alpha",
  "description": "Handles customer support inquiries",
  "system_prompt": "You are a friendly support agent...",
  "user_id": "user_001",
  "language": "en-US",
  "voice_id": "kokoro-default",
  "stt_provider": "whisper",
  "llm_provider": "ollama",
  "tts_provider": "kokoro",
  "temperature": 0.7,
  "max_tokens": 1024,
  "memory_enabled": true,
  "memory_type": "conversation",
  "tools_enabled": true
}
```

### `GET /agents/{id}`
Get agent with tools and social accounts.

### `PUT /agents/{id}`
Update an agent.

### `DELETE /agents/{id}`
Delete an agent.

### Agent Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agents/{id}/tools` | GET | List tools |
| `/agents/{id}/tools` | POST | Add tool |
| `/agents/{id}/tools/{tool_id}` | DELETE | Remove tool |

### Agent Social Accounts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agents/{id}/social` | GET | List social accounts |
| `/agents/{id}/social` | POST | Connect social account |
| `/agents/{id}/social/{social_id}` | DELETE | Disconnect social account |

### Agent Activation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agents/{id}/activate` | POST | Activate agent |
| `/agents/{id}/deactivate` | POST | Deactivate agent |

---

## 7. Knowledge Base / RAG

### `GET /knowledge`
List all knowledge documents.

**Query Params:**
- `status` (optional): `indexed`, `processing`, `failed`
- `search` (optional): Full-text search on document name

### `GET /knowledge/{id}`
Get a single document.

### `POST /knowledge/upload`
Upload a document (PDF, DOCX, TXT, CSV).

**Request:** `multipart/form-data`
- `file` (File, required)
- `name` (string, optional)
- `tags` (string, optional — comma-separated)

### `POST /knowledge/index`
Index plain text content directly.

**Request:**
```json
{
  "content": "Product documentation: Our API supports...",
  "tags": ["docs", "product"]
}
```

### `POST /knowledge/search`
Semantic search across all indexed documents.

**Request:**
```json
{
  "query": "How do I reset my password?",
  "top_k": 5,
  "min_score": 0.0,
  "filter": {}
}
```

### `POST /knowledge/context`
Build formatted context string for LLM prompts.

**Query Params:**
- `query` (string, required)

### `DELETE /knowledge/{id}`
Delete a document and its vector index entries.

### `POST /knowledge/{id}/reindex`
Re-index a document.

### `GET /knowledge/rag/status`
Check RAG service availability and collection stats.

---

## 8. SIP / Telephony

### `GET /sip/calls`
List active SIP calls.

### `GET /sip/calls/{call_id}`
Get a specific SIP call.

### `POST /sip/calls/{call_id}/end`
End an active SIP call.

### `GET /sip/config`
Get SIP trunk configuration.

---

## 9. Social Automation

### `GET /social/connections`
List all social connections.

**Query Params:**
- `platform` (optional): `instagram`, `facebook`, `whatsapp`
- `status` (optional): `connected`, `disconnected`

### `POST /social/connections`
Connect a new social account.

**Request:**
```json
{
  "platform": "instagram",
  "account_id": "business_account_123",
  "account_name": "My Business",
  "auto_reply": true,
  "welcome_message": "Thanks for reaching out!"
}
```

### Social Connection CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/social/connections/{id}` | GET | Get connection |
| `/social/connections/{id}` | PUT | Update connection |
| `/social/connections/{id}` | DELETE | Delete connection |

### Auto-Reply

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/social/connections/{id}/auto-reply` | GET | Get auto-reply config |
| `/social/connections/{id}/auto-reply` | PUT | Update auto-reply config |

### Messages

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/social/connections/{id}/messages` | GET | List messages (query: `limit`, `unread_only`) |
| `/social/connections/{id}/messages` | POST | Send message |
| `/social/messages/inbox` | GET | Aggregated inbox (query: `limit`, `platform`) |

### Platforms

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/social/platforms` | GET | List supported platforms |
| `/social/sync/{connection_id}` | POST | Trigger manual sync |

---

## 10. Voice Profiles

### `GET /voice-profiles`
List all voice profiles (system defaults + user-created clones).

### `GET /voice-profiles/{id}`
Get a single voice profile.

### `POST /voice-profiles`
Create a new voice profile with optional audio sample.

**Request:** `multipart/form-data`
- `name` (string, required)
- `provider` (string, default: `openvoice`)
- `language` (string, default: `en`)
- `gender` (string, optional)
- `description` (string, optional)
- `speaking_rate` (float, optional)
- `pitch` (float, optional)
- `emotion` (string, optional)
- `sample` (File, optional, max 10MB)

### `PUT /voice-profiles/{id}`
Update a voice profile.

### `DELETE /voice-profiles/{id}`
Delete a voice profile and its audio sample.

### Voice Presets

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/voice-profiles/presets/emotions` | GET | List emotion presets |
| `/voice-profiles/presets/providers` | GET | List TTS providers with capabilities |

---

## 11. Twilio Webhooks

All Twilio endpoints receive `POST` requests from Twilio's telephony infrastructure and return TwiML (`text/xml`).

| Endpoint | Description |
|----------|-------------|
| `POST /twilio/incoming` | Incoming call handler — returns greeting TwiML with `<Gather>` |
| `POST /twilio/gather` | Speech input handler — processes user speech through pipeline |
| `POST /twilio/voice` | Fallback when `<Gather>` times out |
| `POST /twilio/status` | Call status callback (completed, failed, etc.) |
| `POST /twilio/outbound` | Generates TwiML for initiating outbound calls |

**TwiML Example:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! How can I help you today?</Say>
  <Gather input="speech dtmf" timeout="5" speechTimeout="auto"
          speechModel="phone_call" action="/twilio/gather" method="POST">
    <Say>Please go ahead.</Say>
  </Gather>
  <Redirect method="POST">/twilio/voice</Redirect>
</Response>
```

---

## 12. Monitoring & Metrics

### `GET /metrics`
Prometheus-formatted metrics endpoint.

**Metrics exposed:**
- `voiceai_uptime_seconds` — Application uptime
- `voiceai_http_requests_total{method,path,status}` — Request counts
- `voiceai_http_duration_ms{method,path}` — Cumulative duration
- `voiceai_ws_connections_active` — Active WebSocket count
- `voiceai_sip_calls_active` — Active SIP call count
- `voiceai_twilio_calls_active` — Active Twilio call count
- `voiceai_providers_registered{type,provider}` — Provider registrations
- `voiceai_gpu_available` — GPU availability (1/0)

### `GET /health/deep`
Deep health check probing all dependencies.

**Response `200` example:**
```json
{
  "status": "healthy",
  "uptime_seconds": 3600.0,
  "version": "0.1.0",
  "services": [
    { "name": "postgres", "status": "healthy", "latency_ms": 2.3 },
    { "name": "chromadb", "status": "healthy", "latency_ms": 1.1 },
    { "name": "livekit", "status": "disabled" },
    { "name": "ollama", "status": "healthy", "latency_ms": 45.0 }
  ],
  "system": {
    "memory_rss_mb": 156.2,
    "memory_percent": 3.5,
    "system_memory_used_percent": 62.0,
    "disk_used_percent": 45.0,
    "disk_free_gb": 128.5,
    "cpu_percent": 2.1
  },
  "gpu": { "available": false }
}
```

### `GET /health/readiness`
Kubernetes readiness probe.

### `GET /health/liveness`
Kubernetes liveness probe.

### `GET /logs/recent`
Recent structured log entries from the ring buffer.

**Query Params:**
- `limit` (int, default `50`, max `200`)

---

## 13. Runtime Status

### `GET /runtime/livekit`
LiveKit room status.

### `GET /runtime/sip`
Active SIP/PSTN call status.

### `GET /runtime/providers`
Provider registration health.

### `GET /runtime/status`
Aggregated runtime status (LiveKit + SIP + providers).

---

## Error Codes

| Code | Meaning |
|------|---------|
| `400` | Bad request — invalid input |
| `401` | Unauthorized — missing or invalid JWT |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `501` | Not implemented (e.g., stub provider) |

**Error Response Format:**
```json
{
  "detail": "STT provider 'deepgram' not available. Available: ['whisper']"
}
```

---

## Rate Limiting

All API endpoints are rate-limited by IP/route using a token bucket algorithm (Redis-backed in production, in-memory fallback):

| Limit | Window | Scope |
|-------|--------|-------|
| 100 requests | 1 minute | Per-IP, per-route |
| 10 requests | 1 minute | `/providers/switch` |
| 20 requests | 1 minute | `/voice/process` |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
