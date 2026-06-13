# MetaPilot AI — Deployment Runbook

**Version:** v3.4
**Last Updated:** June 2026

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│   Backend    │────▶│  PostgreSQL  │
│  Next.js     │     │  Fastify     │     │              │
│  :3000       │     │  :4000       │     │  :5432       │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐     ┌──────────────┐
                    │   Workers    │────▶│    Redis      │
                    │  BullMQ      │     │  :6379        │
                    └──────────────┘     └──────────────┘
                    ┌──────────────┐
                    │   Qdrant     │
                    │  Vector DB   │
                    │  :6333       │
                    └──────────────┘
```

---

## Option 1: Railway (Recommended for MVP)

Railway provides managed PostgreSQL, Redis, and easy deployment.

### Prerequisites
1. Railway account (railway.app)
2. GitHub repository connected to Railway
3. `railway.json` at project root (already exists)

### Steps

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Link project
railway link

# 4. Add PostgreSQL
railway add postgres

# 5. Add Redis
railway add redis

# 6. Set environment variables
railway env set JWT_SECRET=<generate-random-64-char>
railway env set META_APP_ID=<your-meta-app-id>
railway env set META_APP_SECRET=<your-meta-app-secret>
railway env set OPENAI_API_KEY=<your-openai-key>
railway env set RAZORPAY_KEY_ID=<your-razorpay-key>
railway env set RAZORPAY_KEY_SECRET=<your-razorpay-secret>
railway env set RESEND_API_KEY=<your-resend-key>
railway env set FRONTEND_URL=<your-railway-frontend-url>

# 7. Deploy
railway up
```

### Railway Configuration (`railway.json`)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

### Required Railway Services

| Service | Type | Plan |
|---------|------|------|
| PostgreSQL | Database | Starter ($5/mo) |
| Redis | Database | Starter ($5/mo) |
| Backend API | Web Service | Starter ($5/mo) |
| Frontend | Web Service | Starter ($5/mo) |
| Comment Worker | Worker | Usage-based |
| DM Worker | Worker | Usage-based |

**Estimated monthly cost:** $20-30/mo for MVP

---

## Option 2: Docker Compose (VPS)

Full production stack with nginx reverse proxy, SSL, and all services.

### Prerequisites
- VPS with Docker and Docker Compose installed
- Domain name (e.g., `yourdomain.com`)
- DNS A records pointing to VPS IP

### Quick Start

```bash
# 1. Clone the repository on the VPS
git clone https://github.com/yourusername/socialpilot.git /opt/socialpilot
cd /opt/socialpilot

# 2. Create production environment file
cp deploy/.env.prod.example .env.prod
# Edit .env.prod with your secrets

# 3. Set up SSL certificates
chmod +x deploy/setup-ssl.sh
./deploy/setup-ssl.sh yourdomain.com

# 4. Deploy
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

### Manual Deploy Steps

```bash
# Build and start all services
docker compose -f deploy/docker-compose.prod.yml up -d --build

# Check health
curl http://localhost:4000/health

# View logs
docker compose -f deploy/docker-compose.prod.yml logs -f

# Stop
docker compose -f deploy/docker-compose.prod.yml down
```

### Production Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | Generate: `openssl rand -hex 64` |
| `META_APP_ID` | ✅ | Meta App ID |
| `META_APP_SECRET` | ✅ | Meta App Secret |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ | Your verification token |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `RAZORPAY_KEY_ID` | ✅ | Razorpay key |
| `RAZORPAY_KEY_SECRET` | ✅ | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ | Generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | ✅ | Resend API key |
| `DB_PASSWORD` | ✅ | PostgreSQL password |
| `REDIS_PASSWORD` | ✅ | Redis password |
| `FRONTEND_URL` | ✅ | `https://yourdomain.com` |
| `SENTRY_DSN` | Optional | Error tracking |
| `POSTHOG_API_KEY` | Optional | Product analytics |
| `QDRANT_URL` | ✅ | `http://qdrant:6333` |

---

## Option 3: Manual Deploy (No Docker)

### Backend

```bash
# Prerequisites: Node 20+, PostgreSQL, Redis, Qdrant

# Install dependencies
pnpm install

# Build shared package
cd packages/shared && pnpm tsc && cd ../..

# Generate Prisma client
cd backend && npx prisma generate && cd ..

# Build backend
cd backend && pnpm build && cd ..

# Run migrations
cd backend && npx prisma db push && cd ..

# Start
cd backend && node dist/app.js
```

### Frontend

```bash
cd frontend
pnpm install
pnpm build
pnpm start  # Runs on port 3000
```

### Workers

```bash
cd workers
pnpm install
pnpm build
node dist/workers/src/comment.worker.js
node dist/workers/src/dm.worker.js
```

---

## Database Migration Strategy

### Development
```bash
cd backend
npx prisma db push          # Push schema changes (safe)
npx prisma migrate dev      # Create migration files
npx prisma db seed          # Seed demo data
```

### Production
```bash
# The deploy script handles this automatically
docker compose -f deploy/docker-compose.prod.yml exec -T backend npx prisma migrate deploy

# Manual migration
cd backend
npx prisma migrate deploy
```

### Backup & Restore

```bash
# Backup
pg_dump -U postgres socialpilot > backup_$(date +%Y%m%d).sql

# Restore
psql -U postgres socialpilot < backup_20260601.sql
```

---

## Monitoring & Alerts

### Health Endpoint
```
GET /health
→ { "status": "ok", "timestamp": "2026-06-01T..." }
```

### Admin Health Dashboard
```
GET /api/admin/health
Requires: admin role
→ Full system health: DB status, queue status, Sentry/PostHog status
```

### Key Metrics to Monitor
| Metric | Critical Threshold | Action |
|--------|-------------------|--------|
| API Response Time | > 2s | Scale backend |
| Queue Depth | > 1000 pending | Scale workers |
| DB Connections | > 80% of max | Increase pool |
| Disk Usage | > 85% | Clean up / expand |
| Memory Usage | > 90% | Scale up |

### Logging

```bash
# Docker logs
docker compose logs -f --tail=100 backend
docker compose logs -f --tail=100 comment-worker

# Application logs (when not using Docker)
tail -f backend/logs/app.log
```

---

## Rollback Procedure

### Docker Deploy
```bash
# The deploy.sh script creates DB backups before deploying
# To rollback to a specific version:

# 1. Restore the database
psql -U postgres socialpilot < backups/20260601_120000/db_dump.sql

# 2. Revert to previous Docker image
docker compose -f deploy/docker-compose.prod.yml down
git checkout <previous-tag>
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### Railway Deploy
```bash
# Railway stores deployment history
railway rollback <deployment-id>
```

---

## Security Checklist (Pre-Deployment)

- [ ] Rotate all API keys exposed in `.env` (OpenAI, Deepgram, ElevenLabs, Resend, Twilio, LiveKit)
- [ ] Set `JWT_SECRET` to a random 64-character string
- [ ] Set `META_APP_SECRET` to your actual Meta App Secret
- [ ] Remove `dev-secret-change-in-production` fallback (`backend/src/config.ts` line 15)
- [ ] Enable `AUTH_BYPASS=false` in production
- [ ] Set `CORS` origin to your actual frontend domain
- [ ] Configure `ENFORCE_SUBSCRIPTIONS=true` for paid plans
- [ ] Enable webhook signature verification (`META_APP_SECRET` must be set)
- [ ] Run `npx playwright test` to verify all flows
- [ ] Test Razorpay payment flow end-to-end
- [ ] Verify email delivery via Resend

---

## Deployment Commands Quick Reference

```bash
# ── Railway ──
railway login                     # Authenticate
railway link                      # Link project
railway up                        # Deploy
railway logs                      # View logs
railway env list                  # List env vars
railway rollback                  # Rollback

# ── Docker VPS ──
./deploy/deploy.sh                # Full deploy (backup → build → migrate → healthcheck)
docker compose ps                 # Service status
docker compose logs -f            # Stream logs
docker compose down               # Stop all
docker compose restart backend    # Restart single service

# ── Database ──
docker compose exec postgres pg_dump -U postgres socialpilot > backup.sql
docker compose exec backend npx prisma db push
docker compose exec backend npx prisma db seed

# ── Testing ──
cd backend && npx vitest run      # Backend tests
cd frontend && npx vitest run     # Frontend tests
npx playwright test               # E2E tests
```
