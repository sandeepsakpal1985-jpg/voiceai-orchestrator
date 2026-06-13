# AI Sales Agent — Architecture

## Overview

The AI Sales Agent is a provider-independent voice AI system designed for sales calls. It supports interchangeable STT (Speech-to-Text), LLM (Language Model), and TTS (Text-to-Speech) providers, allowing flexible deployment from fully self-hosted (local) to cloud-based configurations.

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser   │     │   Twilio     │     │   LiveKit    │
│  (WebSocket) │     │  (Phone)     │     │  (WebRTC)    │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                    ┌──────▼─────────┐
                    │   FastAPI       │
                    │  Application    │
                    └──────┬─────────┘
                           │
          ┌────────────────┼─────────────────┬─────────────────┐
          │                │                  │                 │
    ┌─────▼─────┐   ┌─────▼──────┐   ┌──────▼──────┐   ┌─────▼──────┐
    │    STT     │   │    LLM     │   │    TTS      │   │  Advanced  │
    │  Providers │   │  Providers │   │  Providers  │   │  Modules   │
    │            │   │            │   │             │   │            │
    │ • Whisper  │   │ • Ollama   │   │ • Kokoro    │   │ • State    │
    │ • Deepgram │   │ • OpenAI   │   │ • ElevenLabs│   │ • Interrupt│
    └────────────┘   └────────────┘   └─────────────┘   │ • Analyzer │
                                                         │ • Playback │
                                                         │ • Registry │
                                                         └─────┬──────┘
                                                               │
                                                    ┌──────────▼──────────┐
                                                    │  Conversation       │
                                                    │  Orchestrator       │
                                                    └─────────────────────┘
```

## Core Components

### 1. Provider Registry (`app/providers/`)
- Abstract base classes for STT, LLM, and TTS providers
- Registry pattern for provider registration and discovery
- Hot-swappable providers at runtime
- GPU auto-detection for optimal device selection

### 2. Voice Pipeline (`app/voice/`)
- Orchestrates STT → LLM → TTS flow
- Audio processing with streaming support
- Audio cache integration for repeated phrases
- State engine for conversation flow management

### 3. Conversation Service (`app/services/`)
- In-memory conversation state management
- Automatic TTL-based cleanup
- Sentiment analysis and history tracking

### 4. Advanced Conversation Service (`app/services/adaptive_conversation.py`)
- Emotional state tracking (CustomerEmotion enum)
- Conversation profiles for different emotional states
- Emotion detection via multi-pattern matching
- Repetition prevention with recently-played tracking
- Interruption handling and recovery flow
- Topic extraction from user input

### 5. Advanced Modules (`app/advanced/`)
- **State Engine**: Keyword/scenario/emotion-based state machine with transition tracking
- **Interrupt Detector**: Barge-in detection (software flag + optional hardware mic monitoring)
- **Conversation Analyzer**: Semantic analysis via Sentence Transformers with keyword fallback
- **Adaptive Playback Engine**: Emotional pacing profiles, flow generation, and playback queue building
- **Audio Registry**: Audio clip library management with metadata and smart selection
- **Conversation Orchestrator**: Top-level coordinator tying all advanced modules together

### 6. Intent Detection (`app/services/intent.py`)
- Keyword-based intent classification
- Extensible pattern matching

### 7. RAG Framework (`app/services/rag.py`)
- ChromaDB vector store integration
- Sentence Transformer embeddings
- Semantic search and knowledge retrieval

### 8. Tool Framework (`app/tools/`)
- LLM-callable tool definitions
- CRM integration tools
- Knowledge base search tool

### 9. State Engine (`app/voice/state_engine.py`)
- Conversation state machine
- Safe state transitions for voice calls
- Emotion-aware routing

### 10. Audio Cache (`app/services/audio_cache.py`)
- Multi-level caching (memory → filesystem)
- Warm-up with common phrases
- TTS latency reduction

### 11. Persistence (`app/services/persistence.py`)
- In-memory store with Redis-backed distributed storage
- Auto-detection of Redis with graceful fallback
- Semantic cache for RAG queries
- Usage tracking and voice profile storage

### 12. LiveKit Integration (`app/livekit/`)
- Room management for WebRTC sessions
- SIP dispatch for PSTN call routing
- STT/TTS/LLM adapters wrapping local providers
- Voice agent worker with function tool support

### 13. Frontend Dashboard (`frontend/`)
- Dark-themed single-page application
- Voice chat widget via WebSocket
- Real-time call monitoring and metrics
- Provider configuration UI
- Auto-refreshing dashboard

## API Routes

| Route | Description |
|-------|-------------|
| `/health` | Health check and provider status |
| `/providers` | List and switch providers |
| `/voice/*` | STT, LLM, TTS endpoints |
| `/ws/voice` | WebSocket voice chat |
| `/conversations/*` | Conversation CRUD |
| `/calls/*` | Call management |
| `/agents/*` | Agent configuration |
| `/twilio/*` | Twilio webhooks |

## Data Flow

1. **Inbound Call** → Twilio → Webhook → Conversation Created → Greeting Generated
2. **User Speech** → STT (Whisper) → Transcription → Intent Detection → **Advanced State Engine**
3. **LLM Processing** → Context Building (with orchestration state) → LLM Completion → Response Text
4. **Audio Response** → TTS (Kokoro) → Audio Cache → Twilio `<Say>` or WebSocket Audio
5. **Interrupt Handling** → Barge-in detected during playback → Recovery flow → Resume

## Project Structure

```
ai-sales-agent/
├── backend/
│   ├── app/
│   │   ├── advanced/       # Advanced conversation modules
│   │   ├── livekit/        # WebRTC voice transport
│   │   ├── middleware/      # Auth, rate limiting
│   │   ├── models/         # Pydantic schemas
│   │   ├── providers/      # STT, LLM, TTS, Memory
│   │   ├── routers/        # API routes
│   │   ├── services/       # Business logic
│   │   ├── tools/          # LLM-callable tools
│   │   ├── voice/          # Pipeline + state engine
│   │   ├── config.py       # App configuration
│   │   └── main.py         # FastAPI entry point
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               # Dashboard UI (HTML/CSS/JS)
├── docker/                 # Docker Compose configurations
├── prompts/                # System prompt templates
├── scripts/                # Utility scripts
├── tests/                  # Test suite
├── telephony/              # Telephony integration docs
└── docs/                   # Documentation
```

## Deployment

- **Backend**: FastAPI + Uvicorn (Python 3.12+)
- **STT**: faster-whisper (local) or Deepgram (cloud)
- **LLM**: Ollama (local) or OpenAI/Gemini/OpenRouter (cloud)
- **TTS**: Kokoro (local) or ElevenLabs (cloud)
- **Database**: In-memory or Redis-backed persistence
- **Cache**: Redis (optional, for distributed state)
- **WebRTC**: LiveKit (optional, profile: full)
