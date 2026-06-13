# AI Sales Agent

A production-ready AI voice agent for sales calls with interchangeable STT, LLM, and TTS providers.

## Features

- **STT (Speech-to-Text)**: Whisper (local) / Deepgram (cloud)
- **LLM (Language Model)**: Ollama/Qwen (local) / OpenAI / Gemini / OpenRouter
- **TTS (Text-to-Speech)**: Kokoro (local, ultra-light) / ElevenLabs (cloud)
- **Voice Pipeline**: End-to-end STT → LLM → TTS orchestration
- **WebSocket Voice Chat**: Real-time browser-based voice conversations
- **Twilio Integration**: Inbound/outbound phone call support
- **Web UI**: Modern dashboard for monitoring and management
- **Conversation Management**: Session tracking, sentiment analysis, history
- **RAG Framework**: Knowledge base search with ChromaDB + sentence transformers
- **Intent Detection**: Keyword-based intent classification
- **Audio Cache**: Multi-level TTS caching for instant playback of common phrases
- **Hot-Swappable Providers**: Switch between providers at runtime without restarts

## Quick Start

### Prerequisites
- Python 3.12+
- Ollama (for local LLM) - `ollama pull qwen2.5:7b`
- Redis (optional, for distributed state)

### Installation

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configuration

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

### Running

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Verify

```bash
curl http://localhost:8000/health
```

## Project Structure

```
ai-sales-agent/
├── backend/           # FastAPI Python backend
│   ├── app/           # Application code
│   │   ├── main.py    # FastAPI entry point
│   │   ├── config.py  # Environment configuration
│   │   ├── models/    # Pydantic schemas
│   │   ├── providers/ # STT, LLM, TTS, memory providers
│   │   ├── voice/     # Voice pipeline & state engine
│   │   ├── services/  # Business logic services
│   │   ├── routers/   # API route handlers
│   │   ├── tools/     # LLM-callable tools
│   │   └── middleware/ # Auth & rate limiting
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          # Web dashboard (placeholder)
├── telephony/         # Twilio/SIP integration docs
├── prompts/           # System prompts for sales scenarios
├── data/              # Data storage directory
├── docs/              # Architecture & deployment docs
├── scripts/           # Utility scripts
├── tests/             # Test suite
└── docker/            # Docker Compose configuration
```

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## License

Proprietary
