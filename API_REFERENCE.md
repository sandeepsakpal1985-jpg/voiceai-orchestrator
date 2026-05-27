# VoiceAI Orchestrator — API Reference

> Complete curl-ready API documentation for all 87 routes.
> Base URL: `http://localhost:8000`

---

## Table of Contents

1. [System & Health](#1-system--health)
2. [Agents (CRUD + Social + Tools)](#2-agents)
3. [Calls](#3-calls)
4. [Conversations](#4-conversations)
5. [Knowledge Base (RAG)](#5-knowledge-base)
6. [Languages](#6-languages)
7. [Monitoring & Metrics](#7-monitoring--metrics)
8. [Providers](#8-providers)
9. [Runtime Status](#9-runtime-status)
10. [SIP / Telephony](#10-sip--telephony)
11. [Social Automation](#11-social-automation)
12. [Twilio Webhooks](#12-twilio-webhooks)
13. [Voice Profiles](#13-voice-profiles)
14. [Voice Processing (STT → LLM → TTS)](#14-voice-processing)

---

## 1. System & Health

### GET /health
Basic health check — returns server status and version.

```bash
curl -s http://localhost:8000/health | jq .
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": 1716500000.0
}
```

### GET /health/liveness
Kubernetes liveness probe — always returns 200 when alive.

```bash
curl -s http://localhost:8000/health/liveness
```

### GET /health/readiness
Kubernetes readiness probe — returns 200 when ready to serve traffic.

```bash
curl -s http://localhost:8000/health/readiness
```

### GET /health/deep
Deep health check — probes all dependencies (Postgres, ChromaDB, LiveKit, Ollama).

```bash
curl -s http://localhost:8000/health/deep | jq .
```

**Response:**
```json
{
  "status": "degraded",
  "services": {
    "database": "ok",
    "chromadb": "unavailable",
    "livekit": "disabled",
    "ollama": "ok"
  },
  "system": {
    "memory": { "total_mb": 32000, "used_mb": 12000, "percent": 37.5 },
    "disk":  { "total_gb": 200, "used_gb": 45, "percent": 22.5 }
  }
}
```

### GET /providers
List all registered providers with capabilities.

```bash
curl -s http://localhost:8000/providers | jq .
```

### POST /providers/switch
Switch active providers at runtime without restart.

```bash
curl -s -X POST http://localhost:8000/providers/switch \
  -H "Content-Type: application/json" \
  -d '{"stt": "whisper", "llm": "ollama", "tts": "kokoro"}' | jq .
```

---

## 2. Agents

### GET /agents
List all agents, optionally filtered.

```bash
curl -s "http://localhost:8000/agents?active=true" | jq .
```

### POST /agents
Create a new AI agent with provider bindings.

```bash
curl -s -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Support Agent",
    "system_prompt": "You are a friendly sales assistant...",
    "language": "en",
    "voice_id": "af_bella",
    "stt_provider": "whisper",
    "llm_provider": "ollama",
    "tts_provider": "kokoro",
    "metadata": {"department": "sales"}
  }' | jq .
```

### GET /agents/{agent_id}
Get a single agent with tools and social accounts.

```bash
curl -s http://localhost:8000/agents/agent-123 | jq .
```

### PUT /agents/{agent_id}
Update an agent's configuration.

```bash
curl -s -X PUT http://localhost:8000/agents/agent-123 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Agent Name", "language": "es"}' | jq .
```

### DELETE /agents/{agent_id}
Delete an agent and all associated tools/social accounts.

```bash
curl -s -X DELETE http://localhost:8000/agents/agent-123 | jq .
```

### POST /agents/{agent_id}/activate
Activate an agent (enables call/message reception).

```bash
curl -s -X POST http://localhost:8000/agents/agent-123/activate | jq .
```

### POST /agents/{agent_id}/deactivate
Deactivate an agent.

```bash
curl -s -X POST http://localhost:8000/agents/agent-123/deactivate | jq .
```

### GET /agents/{agent_id}/tools
List all tools configured for an agent.

```bash
curl -s http://localhost:8000/agents/agent-123/tools | jq .
```

### POST /agents/{agent_id}/tools
Add a tool to an agent (function call / webhook / workflow).

```bash
curl -s -X POST http://localhost:8000/agents/agent-123/tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "function",
    "name": "lookup_order",
    "description": "Look up order by ID",
    "config": {"endpoint": "https://api.example.com/orders"}
  }' | jq .
```

### DELETE /agents/{agent_id}/tools/{tool_id}
Remove a tool from an agent.

```bash
curl -s -X DELETE http://localhost:8000/agents/agent-123/tools/tool-456 | jq .
```

### GET /agents/{agent_id}/social
List social accounts connected to an agent.

```bash
curl -s http://localhost:8000/agents/agent-123/social | jq .
```

### POST /agents/{agent_id}/social
Connect a social media account to an agent.

```bash
curl -s -X POST http://localhost:8000/agents/agent-123/social \
  -H "Content-Type: application/json" \
  -d '{"platform": "facebook", "page_id": "123456", "access_token": "..."}' | jq .
```

### DELETE /agents/{agent_id}/social/{social_id}
Disconnect a social account from an agent.

```bash
curl -s -X DELETE http://localhost:8000/agents/agent-123/social/social-789 | jq .
```

---

## 3. Calls

### POST /calls
Initiate a new AI voice call. Creates a conversation and generates initial greeting.

```bash
curl -s -X POST http://localhost:8000/calls \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+15551234567",
    "agent_id": "agent-123",
    "language": "en"
  }' | jq .
```

### POST /calls/{conversation_id}/action
Perform an action on an active call.

```bash
# Process speech input
curl -s -X POST http://localhost:8000/calls/conv-123/action \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process_input",
    "data": {"text": "I need help with my order"}
  }' | jq .

# End call
curl -s -X POST http://localhost:8000/calls/conv-123/action \
  -H "Content-Type: application/json" \
  -d '{"action": "end"}' | jq .

# Pause/resume
curl -s -X POST http://localhost:8000/calls/conv-123/action \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}' | jq .
```

### POST /calls/{conversation_id}/input
Process text input (for testing or text-based channels).

```bash
curl -s -X POST http://localhost:8000/calls/conv-123/input \
  -H "Content-Type: application/json" \
  -d '{"text": "What are your business hours?", "language": "en"}' | jq .
```

---

## 4. Conversations

### GET /conversations
List all conversations, optionally filtered to active ones.

```bash
curl -s "http://localhost:8000/conversations?active_only=true" | jq .
```

### POST /conversations
Create a new conversation.

```bash
curl -s -X POST http://localhost:8000/conversations \
  -H "Content-Type: application/json" \
  -d '{
    "contact_phone": "+15551234567",
    "contact_name": "John Doe",
    "metadata": {"source": "website"}
  }' | jq .
```

### GET /conversations/{conversation_id}
Get a conversation by ID.

```bash
curl -s http://localhost:8000/conversations/conv-123 | jq .
```

### DELETE /conversations/{conversation_id}
Delete a conversation.

```bash
curl -s -X DELETE http://localhost:8000/conversations/conv-123 | jq .
```

### POST /conversations/{conversation_id}/messages
Add a message to a conversation.

```bash
curl -s -X POST http://localhost:8000/conversations/conv-123/messages \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Hello!"}' | jq .
```

### GET /conversations/{conversation_id}/messages
Get recent messages from a conversation.

```bash
curl -s "http://localhost:8000/conversations/conv-123/messages?limit=10" | jq .
```

### PATCH /conversations/{conversation_id}/status
Update conversation status.

```bash
curl -s -X PATCH http://localhost:8000/conversations/conv-123/status \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' | jq .
```

### GET /conversations/{conversation_id}/summary
Get a summary of a conversation.

```bash
curl -s http://localhost:8000/conversations/conv-123/summary | jq .
```

---

## 5. Knowledge Base

### GET /knowledge
List all knowledge documents with optional filtering.

```bash
curl -s "http://localhost:8000/knowledge?tag=support&page=1&per_page=20" | jq .
```

### POST /knowledge/upload
Upload a document for indexing (PDF, DOCX, TXT, CSV).

```bash
curl -s -X POST http://localhost:8000/knowledge/upload \
  -F "file=@/path/to/document.pdf" \
  -F "tags=support,frequently-asked" | jq .
```

### POST /knowledge/index
Index plain text content directly (no file upload).

```bash
curl -s -X POST http://localhost:8000/knowledge/index \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Return Policy",
    "content": "Our return policy allows returns within 30 days...",
    "tags": ["policy", "returns"]
  }' | jq .
```

### POST /knowledge/search
Search the knowledge base using semantic (vector) search.

```bash
curl -s -X POST http://localhost:8000/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is your return policy?", "top_k": 5}' | jq .
```

### POST /knowledge/context
Build a formatted context string from relevant knowledge for LLM prompts.

```bash
curl -s -X POST http://localhost:8000/knowledge/context \
  -H "Content-Type: application/json" \
  -d '{
    "query": "shipping information",
    "max_tokens": 2000
  }' | jq .
```

### GET /knowledge/rag/status
Check RAG service availability and collection stats.

```bash
curl -s http://localhost:8000/knowledge/rag/status | jq .
```

### GET /knowledge/{document_id}
Get a single document by ID.

```bash
curl -s http://localhost:8000/knowledge/doc-123 | jq .
```

### DELETE /knowledge/{document_id}
Delete a document and its vector index entries.

```bash
curl -s -X DELETE http://localhost:8000/knowledge/doc-123 | jq .
```

### POST /knowledge/{document_id}/reindex
Re-index a document (delete + re-embed all chunks).

```bash
curl -s -X POST http://localhost:8000/knowledge/doc-123/reindex | jq .
```

---

## 6. Languages

### GET /api/languages
Get all supported languages with provider mappings.

```bash
curl -s http://localhost:8000/api/languages | jq .
```

**Response excerpt:**
```json
{
  "languages": [
    {"code": "en", "name": "English", "stt": true, "llm": true, "tts": true},
    {"code": "es", "name": "Spanish", "stt": true, "llm": true, "tts": true},
    {"code": "fr", "name": "French", "stt": true, "llm": true, "tts": true},
    {"code": "hi", "name": "Hindi", "stt": true, "llm": true, "tts": false}
  ]
}
```

### GET /api/languages/{code}
Get a single language by ISO code.

```bash
curl -s http://localhost:8000/api/languages/es | jq .
```

---

## 7. Monitoring & Metrics

### GET /metrics
Prometheus-formatted metrics endpoint.

```bash
curl -s http://localhost:8000/metrics
```

**Exposed metrics:**
```
voiceai_uptime_seconds{version="0.1.0"}
voiceai_http_requests_total{method="GET",path="/health",status="200"}
voiceai_http_duration_ms{method="GET",path="/health"}
voiceai_ws_connections_active
voiceai_sip_calls_active
voiceai_twilio_calls_active
voiceai_providers_registered{type="stt",provider="whisper"}
voiceai_gpu_available{available="false"}
```

### GET /logs/recent
Get recent structured log entries from ring buffer.

```bash
curl -s "http://localhost:8000/logs/recent?limit=50" | jq .
```

---

## 8. Providers

### GET /providers
List all registered providers with capabilities.

```bash
curl -s http://localhost:8000/providers | jq .
```

### POST /providers/switch
Switch active providers at runtime.

```bash
curl -s -X POST http://localhost:8000/providers/switch \
  -H "Content-Type: application/json" \
  -d '{
    "stt": "whisper",
    "llm": "openai",
    "tts": "elevenlabs"
  }' | jq .
```

---

## 9. Runtime Status

### GET /runtime/status
Full aggregated runtime status (LiveKit + SIP + Providers combined).

```bash
curl -s http://localhost:8000/runtime/status | jq .
```

### GET /runtime/livekit
LiveKit room status — active rooms, participants, connection info.

```bash
curl -s http://localhost:8000/runtime/livekit | jq .
```

### GET /runtime/providers
Provider registration health — all registered STT/LLM/TTS providers.

```bash
curl -s http://localhost:8000/runtime/providers | jq .
```

### GET /runtime/sip
Active SIP/PSTN call status.

```bash
curl -s http://localhost:8000/runtime/sip | jq .
```

---

## 10. SIP / Telephony

### GET /sip/config
Get current SIP trunk configuration.

```bash
curl -s http://localhost:8000/sip/config | jq .
```

### GET /sip/calls
List all active SIP calls.

```bash
curl -s http://localhost:8000/sip/calls | jq .
```

### GET /sip/calls/{call_id}
Get a specific SIP call's details.

```bash
curl -s http://localhost:8000/sip/calls/sip-call-123 | jq .
```

### POST /sip/calls/{call_id}/end
End an active SIP call.

```bash
curl -s -X POST http://localhost:8000/sip/calls/sip-call-123/end | jq .
```

---

## 11. Social Automation

### GET /social/platforms
List all supported social platforms with status.

```bash
curl -s http://localhost:8000/social/platforms | jq .
```

### GET /social/connections
List all social media connections with optional filtering.

```bash
curl -s "http://localhost:8000/social/connections?platform=facebook" | jq .
```

### POST /social/connections
Connect a new social media account.

```bash
curl -s -X POST http://localhost:8000/social/connections \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "facebook",
    "page_id": "123456",
    "access_token": "EAA...",
    "webhook_secret": "whsec_..."
  }' | jq .
```

### GET /social/connections/{connection_id}
Get a single social connection by ID.

```bash
curl -s http://localhost:8000/social/connections/conn-123 | jq .
```

### PUT /social/connections/{connection_id}
Update a social connection's configuration.

```bash
curl -s -X PUT http://localhost:8000/social/connections/conn-123 \
  -H "Content-Type: application/json" \
  -d '{"auto_reply_enabled": true}' | jq .
```

### DELETE /social/connections/{connection_id}
Disconnect and remove a social media account.

```bash
curl -s -X DELETE http://localhost:8000/social/connections/conn-123 | jq .
```

### GET /social/connections/{connection_id}/messages
List recent messages from a social connection.

```bash
curl -s "http://localhost:8000/social/connections/conn-123/messages?limit=20" | jq .
```

### POST /social/connections/{connection_id}/messages
Send a message through a social connection.

```bash
curl -s -X POST http://localhost:8000/social/connections/conn-123/messages \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_id": "user-456",
    "text": "Hello! How can we help you today?"
  }' | jq .
```

### GET /social/connections/{connection_id}/auto-reply
Get auto-reply configuration.

```bash
curl -s http://localhost:8000/social/connections/conn-123/auto-reply | jq .
```

### PUT /social/connections/{connection_id}/auto-reply
Update auto-reply settings.

```bash
curl -s -X PUT http://localhost:8000/social/connections/conn-123/auto-reply \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "message": "Thanks for your message! We'll get back to you shortly.",
    "keywords": ["help", "support", "question"]
  }' | jq .
```

### POST /social/sync/{connection_id}
Trigger a sync for a social connection.

```bash
curl -s -X POST http://localhost:8000/social/sync/conn-123 | jq .
```

### GET /social/messages/inbox
Aggregated inbox across all connected social platforms.

```bash
curl -s "http://localhost:8000/social/messages/inbox?limit=50&unread_only=true" | jq .
```

---

## 12. Twilio Webhooks

### POST /twilio/incoming
Handle incoming Twilio voice calls. Returns TwiML.

```bash
curl -s -X POST http://localhost:8000/twilio/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&From=%2B15551234567&To=%2B15557654321&CallStatus=ringing"
```

### POST /twilio/gather
Handle gathered speech input from caller.

```bash
curl -s -X POST http://localhost:8000/twilio/gather \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&From=%2B15551234567&SpeechResult=I+need+help&Confidence=0.95"
```

### POST /twilio/voice
Fallback handler when `<Gather>` times out.

```bash
curl -s -X POST http://localhost:8000/twilio/voice \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&From=%2B15551234567"
```

### POST /twilio/outbound
Initiate an outbound call via Twilio. Returns TwiML.

```bash
curl -s -X POST http://localhost:8000/twilio/outbound \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "from": "+15557654321",
    "agent_id": "agent-123"
  }' | jq .
```

### POST /twilio/status
Handle call status callbacks from Twilio.

```bash
curl -s -X POST http://localhost:8000/twilio/status \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123&CallStatus=completed&From=%2B15551234567&Duration=120"
```

---

## 13. Voice Profiles

### GET /voice-profiles
List all voice profiles (system defaults + user-created).

```bash
curl -s http://localhost:8000/voice-profiles | jq .
```

### POST /voice-profiles
Create a new voice profile with optional speaker sample for cloning.

```bash
curl -s -X POST http://localhost:8000/voice-profiles \
  -F "name=My Cloned Voice" \
  -F "provider=openvoice" \
  -F "language=en" \
  -F "gender=female" \
  -F "description=Warm, friendly voice for customer support" \
  -F "sample=@/path/to/speaker_sample.wav" | jq .
```

### GET /voice-profiles/presets/emotions
List available emotion presets for TTS.

```bash
curl -s http://localhost:8000/voice-profiles/presets/emotions | jq .
```

### GET /voice-profiles/presets/providers
List available TTS providers with capabilities.

```bash
curl -s http://localhost:8000/voice-profiles/presets/providers | jq .
```

### GET /voice-profiles/{profile_id}
Get a single voice profile by ID.

```bash
curl -s http://localhost:8000/voice-profiles/profile-123 | jq .
```

### PUT /voice-profiles/{profile_id}
Update an existing voice profile.

```bash
curl -s -X PUT http://localhost:8000/voice-profiles/profile-123 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "speaking_rate": 1.2}' | jq .
```

### DELETE /voice-profiles/{profile_id}
Delete a voice profile and its audio sample.

```bash
curl -s -X DELETE http://localhost:8000/voice-profiles/profile-123 | jq .
```

---

## 14. Voice Processing

### POST /voice/transcribe
Transcribe audio to text using configured STT provider.

```bash
# Base64-encoded audio
curl -s -X POST http://localhost:8000/voice/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "//uQxAAAAAANIAAAAAE...",
    "language": "en",
    "encoding": "wav"
  }' | jq .
```

### POST /voice/process
Full pipeline: STT → LLM → Intent analysis.

```bash
curl -s -X POST http://localhost:8000/voice/process \
  -H "Content-Type: application/json" \
  -d '{
    "audio": "//uQxAAAAAANIAAAAAE...",
    "language": "en",
    "conversation_id": "conv-123",
    "system_prompt": "You are a helpful assistant..."
  }' | jq .
```

**Response:**
```json
{
  "transcription": "I need help with my order",
  "response": "I'd be happy to help you with your order. Could you please provide your order number?",
  "intent": {"name": "order_inquiry", "confidence": 0.92},
  "conversation_id": "conv-123",
  "adaptive": {
    "emotion": "neutral",
    "trust": 5,
    "patience": 5
  }
}
```

### POST /voice/complete
Send text through LLM completion only. Returns raw response text.

```bash
curl -s -X POST http://localhost:8000/voice/complete \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is your return policy?"}
    ]
  }'
```

### POST /voice/complete/stream
Streaming LLM completion via SSE.

```bash
curl -s -N -X POST http://localhost:8000/voice/complete/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Tell me a story about AI."}
    ]
  }'
```

### POST /voice/synthesize
Synthesize text to speech.

```bash
curl -s -X POST http://localhost:8000/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello! Welcome to our support line. How can I help you today?",
    "voice_id": "af_bella",
    "language": "en",
    "speaking_rate": 1.0,
    "pitch": 0.0
  }' --output output.wav
```

### POST /voice/intent
Detect intent from text.

```bash
curl -s -X POST http://localhost:8000/voice/intent \
  -H "Content-Type: application/json" \
  -d '{"text": "I want to cancel my subscription"}' | jq .
```

### GET /voice/livekit-token
Generate a LiveKit access token for browser clients.

```bash
curl -s "http://localhost:8000/voice/livekit-token?room_name=my-room" | jq .
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "room_name": "voiceai-my-room",
  "ws_url": "ws://localhost:7880"
}
```

### WebSocket /ws/voice
Real-time bidirectional voice WebSocket for browser voice chat.

```
ws://localhost:8000/ws/voice?token=<jwt-token>
```

---

## Quick Reference: Common Patterns

```bash
# 1. Health check
curl -s localhost:8000/health | jq .

# 2. Create conversation + send message
CONV_ID=$(curl -s -X POST localhost:8000/conversations \
  -H "Content-Type: application/json" \
  -d '{"contact_phone": "+15551234567", "contact_name": "Test"}' | jq -r '.id')

curl -s -X POST "localhost:8000/conversations/$CONV_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"role": "user", "content": "Hello!"}'

curl -s "localhost:8000/conversations/$CONV_ID/messages" | jq .

# 3. Process through LLM
curl -s -X POST localhost:8000/voice/complete \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What services do you offer?"}]}' | jq -r '.choices[0].message.content'

# 4. Synthesize speech
curl -s -X POST localhost:8000/voice/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text": "Welcome to VoiceAI!", "language": "en"}' --output greeting.wav

# 5. Deep health
curl -s localhost:8000/health/deep | jq .
```
