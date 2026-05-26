# VoiceAI Orchestrator — Architecture Overview

```mermaid
graph TB
    subgraph "Users"
        Browser["🌐 Browser (WebRTC)"]
        Phone["📞 Phone (PSTN)"]
        Social["💬 Social (IG/FB/WA)"]
    end

    subgraph "Frontend"
        Dashboard["📊 Next.js Dashboard<br/>Port 3000"]
        Auth["🔐 NextAuth.js"]
        WSServer["🔌 WebSocket Server<br/>(Node.js)"]
        UI["🎨 20+ Radix UI Components<br/>Charts, Tables, Forms"]
    end

    subgraph "Backend API"
        FastAPI["⚡ FastAPI Backend<br/>Port 8000"]
        Middleware["🛡️ Middleware Stack<br/>CORS → Rate Limit → Auth → Subscription"]
        Routers["📡 13 API Routers<br/>Voice, Calls, SIP, Social,<br/>Agents, Knowledge, Monitoring..."]
    end

    subgraph "AI Providers"
        STT["🎤 STT<br/>Whisper (Local) ⭐<br/>Deepgram (Cloud)"]
        LLM["🧠 LLM<br/>Ollama (Local) ⭐<br/>OpenAI / Gemini / OpenRouter"]
        TTS["🔊 TTS<br/>Kokoro (Local) ⭐<br/>OpenVoice / XTTS / Qwen3 / ElevenLabs"]
    end

    subgraph "Realtime Voice"
        LiveKit["🎙️ LiveKit Server<br/>Port 7880-7882"]
        SIP["📞 SIP Dispatch<br/>Twilio SIP Trunk → PSTN"]
        AgentWorker["🤖 Agent Worker<br/>STT → LLM → TTS Pipeline"]
        RoomMgr["🚪 Room Manager"]
    end

    subgraph "Services & Memory"
        ConvService["💬 Conversation Service"]
        Adaptive["🎭 Adaptive Conversation<br/>Emotion State Machine"]
        RAG["📚 RAG Engine<br/>ChromaDB Vector Store"]
        Memory["🧠 Persistence Layer<br/>Redis / In-Memory"]
        Tools["🔧 MCP Tool Registry<br/>CRM Tools, RAG Tool"]
    end

    subgraph "Advanced Features"
        StateEngine["⚙️ State Engine<br/>FSM + Emotion Tracking"]
        Interrupt["⏸️ Interrupt Detector<br/>Barge-in Detection"]
        Playback["▶️ Adaptive Playback<br/>Dynamic Pacing"]
        Analyzer["📊 Conversation Analyzer<br/>Semantic Intent"]
        Orchestrator["🎯 Realtime Orchestrator<br/>Coordinates All Modules"]
    end

    subgraph "Data Stores"
        PostgreSQL[("🗄️ PostgreSQL<br/>Auth, CRM, Calls")]
        ChromaDB[("🔍 ChromaDB<br/>Vector Embeddings")]
        Redis[("⚡ Redis<br/>Caching, Rate Limits<br/>(Optional)")]
        Ollama["🦙 Ollama Server<br/>Port 11434"]
    end

    subgraph "DevOps"
        Docker["🐳 Docker Compose<br/>8 Services"]
        GPU[("🎮 GPU Acceleration<br/>CUDA 12.4")]
        CI["🔄 CI/CD<br/>GitHub Actions"]
    end

    %% Connections
    Browser --> Dashboard
    Browser --> LiveKit
    Phone --> SIP
    SIP --> LiveKit
    Social --> Routers
    Social --> FastAPI

    Dashboard --> FastAPI
    Dashboard --> WSServer

    FastAPI --> Middleware
    Middleware --> Routers

    Routers --> ConvService
    Routers --> RAG
    Routers --> Adaptive
    Routers --> Tools

    ConvService --> Adaptive
    ConvService --> Memory
    ConvService --> PostgreSQL

    Adaptive --> StateEngine
    Adaptive --> Analyzer
    StateEngine --> Orchestrator
    Interrupt --> Orchestrator
    Playback --> Orchestrator
    Analyzer --> Orchestrator

    RAG --> ChromaDB
    Memory --> Redis

    LiveKit --> RoomMgr
    LiveKit --> AgentWorker
    AgentWorker --> STT
    AgentWorker --> LLM
    AgentWorker --> TTS
    LLM --> Ollama
    Tools --> LLM

    Docker --> GPU
    Docker --> CI

    %% Style
    classDef frontend fill:#6366f1,color:#fff,stroke:#4338ca
    classDef backend fill:#0ea5e9,color:#fff,stroke:#0284c7
    classDef ai fill:#10b981,color:#fff,stroke:#059669
    classDef advanced fill:#f59e0b,color:#fff,stroke:#d97706
    classDef data fill:#8b5cf6,color:#fff,stroke:#7c3aed
    classDef infra fill:#64748b,color:#fff,stroke:#475569

    class Dashboard,Auth,WSServer,UI frontend
    class FastAPI,Middleware,Routers backend
    class STT,LLM,TTS,AgentWorker ai
    class StateEngine,Interrupt,Playback,Analyzer,Orchestrator advanced
    class PostgreSQL,ChromaDB,Redis,Ollama data
    class Docker,GPU,CI infra
```

## Component Map

| Layer | Component | Technology | Status |
|-------|-----------|------------|--------|
| **Frontend** | Dashboard | Next.js 16 / React 19 / TypeScript | ✅ 24 pages |
| **Frontend** | UI Components | Radix UI / Tailwind / Recharts | ✅ 20+ components |
| **Frontend** | WebSocket Server | Node.js / ws | ✅ Real-time bridge |
| **API** | REST Backend | FastAPI / Python 3.12 | ✅ 13 routers |
| **API** | Middleware | JWT / Token Bucket | ✅ Auth + Rate Limit |
| **AI** | STT | Whisper (local) / Deepgram | ✅ 2 providers |
| **AI** | LLM | Ollama / OpenAI / Gemini / OpenRouter | ✅ 4 providers |
| **AI** | TTS | Kokoro / OpenVoice / XTTS / Qwen3 / ElevenLabs | ✅ 5 providers |
| **Voice** | Transport | LiveKit WebRTC | ✅ Full integration |
| **Voice** | Telephony | SIP / Twilio PSTN | ✅ Phone calls |
| **Memory** | Vector Store | ChromaDB + SentenceTransformers | ✅ RAG enabled |
| **Memory** | Persistence | Redis / In-Memory fallback | ✅ Dual mode |
| **Advanced** | State Engine | FSM + Emotion Tracking | ✅ 12+ scenarios |
| **Advanced** | Interrupt | Barge-in Detection | ✅ Real-time |
| **Advanced** | Playback | Adaptive Pacing Engine | ✅ Per-emotion profiles |
| **Advanced** | Analyzer | Semantic + Keyword | ✅ Hybrid |
| **Infra** | Containers | Docker Compose | ✅ 8 services |
| **Infra** | GPU | CUDA 12.4 | ✅ Auto-detection |
| **Infra** | CI/CD | GitHub Actions | ✅ Backend + Dashboard |

## Data Flow: Voice Call

```
User speaks → LiveKit captures audio
           → Agent Worker receives frames
           → STT (Whisper) transcribes to text
           → Orchestrator processes through State Engine
           → Adaptive Conversation determines emotion
           → LLM (Ollama) generates response
           → TTS (Kokoro) synthesizes speech
           → Agent Worker publishes audio back to LiveKit
           → User hears response
```
