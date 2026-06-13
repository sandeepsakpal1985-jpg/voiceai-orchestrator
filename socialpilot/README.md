# SocialPilot AI — AI Social Sales Agent

> **Hire an AI sales employee in 5 minutes.**

MetaPilot AI is a production-ready SaaS platform that connects Instagram Business accounts and Facebook Pages to an AI-powered sales and customer engagement assistant. The AI automatically replies to comments and DMs, captures and qualifies leads, creates CRM opportunities, generates business insights, and escalates sensitive conversations.

## Product Philosophy

This product is **NOT**:
- A chatbot builder
- Complex automation software
- A technical marketing platform

This product **IS**:
An **AI employee** that helps businesses generate leads, convert customers, support inquiries, protect reputation, and increase revenue — just by connecting their social accounts.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker (optional, for infrastructure)
- OpenAI API key
- Meta Developer App (for Instagram/Facebook integration)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your API keys and configuration

# 3. Set up the database
cd backend
npx prisma generate
npx prisma db push
cd ..

# 4. Start development servers
# Terminal 1 — Backend API
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Workers (optional, for queue processing)
cd workers && npx tsx src/comment.worker.ts
cd workers && npx tsx src/dm.worker.ts
```

### Docker (All Services)

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, Qdrant, the backend API, and comment/dm workers.

## Architecture

```
socialpilot/
├── backend/              # Fastify API server
│   ├── src/
│   │   ├── modules/      # Domain modules (auth, meta, comments, dms, etc.)
│   │   ├── services/     # Core services (AI, memory, vector, queue)
│   │   ├── plugins/      # Fastify plugins (auth, prisma)
│   │   └── utils/        # Shared utilities
│   └── prisma/           # Database schema and migrations
├── frontend/             # Next.js application
│   └── src/
│       ├── app/          # Next.js App Router pages
│       ├── components/   # UI components
│       └── lib/          # API client and utilities
├── workers/              # BullMQ background workers
│   └── src/              # Comment, DM, and re-engagement workers
├── packages/
│   └── shared/           # Shared TypeScript types, constants, and schemas
├── docker-compose.yml    # Docker Compose for all services
└── Dockerfile.*          # Dockerfiles for backend and workers
```

## User Onboarding

1. **Create account** — Sign up with email/password or Google
2. **Connect Instagram** — OAuth to your Instagram Business account
3. **Connect Facebook** — Link your Facebook Page
4. **Upload FAQs** — Upload PDF, DOCX, or TXT files with your business information
5. **Add CTA** — Configure call-to-action (website, WhatsApp, Calendly, demo booking, payment link)
6. **Choose AI Personality** — Select from Friendly, Premium, Luxury, Customer Support, or Sales Closer
7. **Turn Automation ON** — Your AI employee starts working

## Key Features

| Feature | Description |
|---|---|
| **Comment Automation** | Auto-reply to Instagram & Facebook comments with intelligent classification |
| **DM Automation** | AI-driven conversations that qualify leads and drive conversions |
| **Lead Management** | Track and categorize leads (Cold/Warm/Hot/VIP) |
| **CRM Pipeline** | Kanban board with drag-and-drop deal management |
| **Unified Inbox** | Single view for all social conversations with human takeover |
| **Knowledge Base** | RAG-powered FAQ training to prevent AI hallucinations |
| **Escalation Engine** | Auto-detect legal threats, complaints, and urgent issues |
| **Re-engagement** | Automatic follow-up sequences for dormant leads |
| **Analytics Dashboard** | Real-time metrics on performance and growth |
| **Team Management** | Role-based access (Owner, Admin, Sales Agent, Support Agent) |
| **Approval Mode** | Optional human-in-the-loop for AI responses |
| **Admin Panel** | System monitoring, audit logs, and user management |

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, ShadCN UI
- **Backend:** Fastify, TypeScript, Prisma ORM
- **Database:** PostgreSQL
- **Queue:** Redis + BullMQ
- **Vector DB:** Qdrant
- **AI:** OpenAI GPT-4o-mini
- **Auth:** JWT + Google OAuth
- **Storage:** Supabase Storage
- **AI Personalities:** 5 configurable personas with distinct tones

## API Documentation

When the backend is running, visit `http://localhost:4000/docs` for interactive Swagger documentation.

### Main API Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/auth/register` | Create account |
| `POST /api/auth/login` | Sign in |
| `GET /api/auth/me` | Current user |
| `GET /api/meta/connections` | List Meta connections |
| `POST /api/meta/webhook` | Meta webhook receiver |
| `GET /api/comments` | List comments |
| `GET /api/dms` | List DM conversations |
| `GET /api/leads` | List leads |
| `GET /api/crm` | Get CRM pipeline (grouped by stage) |
| `GET /api/inbox` | Unified inbox |
| `GET /api/analytics/overview` | Dashboard overview |
| `GET /api/knowledge` | List knowledge documents |
| `GET /api/escalations` | Escalation tickets |
| `GET /api/admin/usage` | Admin usage statistics |

## Architecture Decisions

- **Modular monolith** — Backend is organized by domain modules, making it easy to extract into microservices later
- **BullMQ for queues** — Handles comment delays (45-90s random), DM processing, and re-engagement scheduling
- **RAG with Qdrant** — Knowledge documents are embedded and retrieved to ground AI responses
- **Customer Memory** — Persistent memory system ensures personalized conversations across sessions
- **Separate workers** — Heavy AI processing runs in background workers, keeping the API responsive

## Future Expansion

The architecture supports adding:
- WhatsApp, Telegram, LinkedIn, and TikTok integrations
- White-label / agency mode
- Advanced visual workflow builder
- Multi-language support
- Custom AI model fine-tuning

## License

Private — All rights reserved.
