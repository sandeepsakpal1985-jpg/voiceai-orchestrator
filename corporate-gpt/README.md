# CorporateGPT Enterprise

**Enterprise Knowledge Intelligence Platform**

CorporateGPT is a production-ready, multi-tenant enterprise knowledge platform that enables employees to instantly find answers from company SOPs, policies, procedures, manuals, and documentation using natural language.

## Features

### Core
- **ChatGPT-style Interface** — Ask questions in natural language, get answers with citations
- **Multi-Tenant Architecture** — Complete data isolation between organizations
- **Role-Based Access Control** — 5 roles: Super Admin, Company Admin, Department Admin, Employee, Auditor
- **Document Pipeline** — Upload, OCR, chunk, embed, and index 12+ file formats
- **Semantic Search** — Hybrid vector + keyword search with department filters
- **Citation Engine** — Every answer includes document name, page, section, and confidence score
- **AI Modes** — Strict Knowledge, General Assistant, Expert mode
- **Knowledge Health** — Auto-detect gaps, outdated docs, conflicts, low-confidence areas
- **Auto FAQs** — Automatically generate FAQs from uploaded documents
- **Audit Logs** — Complete audit trail for compliance
- **Analytics Dashboard** — Usage metrics, search success rate, feedback analysis

### Infrastructure
- **100% Private** — Deploy on-premise, private cloud, AWS, Azure, GCP, or air-gapped
- **Docker Compose** — One-command deployment
- **Scalable** — From 10 to 50,000+ users
- **Enterprise Security** — Encryption at rest/transit, tenant isolation, audit trails, rate limiting

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| Database | PostgreSQL 16 |
| Vector DB | Qdrant |
| Cache/Queue | Redis + Celery |
| Auth | JWT, OAuth-ready, LDAP-ready |
| Container | Docker, Docker Compose |

## Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API key (or compatible LLM)

### 1. Clone & Configure
```bash
cp .env.example .env
# Edit .env with your settings
```

### 2. Start Services
```bash
docker-compose up -d
```

### 3. Access
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Deployment Modes

- **Docker Compose** — Local or single-server deployment
- **Production** — `deploy/docker-compose.prod.yml` with nginx, SSL, replicas
- **Air-Gapped** — `docker-compose.airgap.yml` for no-internet environments
- **Kubernetes** — Future ready, stateless services

## Architecture

```
┌─────────┐  ┌──────────┐  ┌────────┐
│ Frontend │──│  Backend  │──│ Qdrant │
│ :3000    │  │ :8000     │  │ :6333  │
└─────────┘  ├──────────┤  └────────┘
             │ Celery   │──┐
             │ Workers  │  │
             └──────────┘  │
┌─────────┐               │
│ Postgres│◄──────────────┘
│ :5432   │
└─────────┘
```

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/auth/login` | Login |
| `POST /api/v1/auth/register` | Register new organization |
| `POST /api/v1/documents/upload` | Upload document |
| `GET /api/v1/search/?q=...` | Semantic search |
| `POST /api/v1/chat/{id}/messages` | Chat with AI |
| `GET /api/v1/analytics/dashboard` | Analytics |
| `GET /api/v1/knowledge-health` | Knowledge health |

## License

**CorporateGPT Enterprise** — Commercial License
