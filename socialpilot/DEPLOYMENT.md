# MetaPilot AI — Deployment Guide

> **Deploy your AI Social Sales Agent to production.**

This guide covers local development, Docker Compose, production deployment on a VPS, cloud platform options, and common troubleshooting.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start (Local Development)](#2-quick-start-local-development)
3. [Docker Compose (All Services)](#3-docker-compose-all-services)
4. [Production Deployment (VPS)](#4-production-deployment-vps)
5. [Cloud Platforms](#5-cloud-platforms)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Health Checks & Monitoring](#7-health-checks--monitoring)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 18 | Required for all services |
| pnpm | >= 8 | Package manager (monorepo requirement) |
| PostgreSQL | >= 15 | Main application database |
| Redis | >= 7 | BullMQ queue backend |
| Qdrant | latest | Vector database for RAG |
| Docker (optional) | >= 24 | Containerized deployment |
| Meta Developer App | — | For Instagram/Facebook OAuth |
| OpenAI API key | — | AI-powered features |
| Google OAuth credentials | — | Optional — social login |

---

## 2. Quick Start (Local Development)

### 2.1 One-command setup

```bash
# Clone & enter the project
git clone <repo-url> socialpilot
cd socialpilot

# Copy environment config
cp .env.example .env

# Install dependencies
pnpm install

# Generate Prisma client
cd backend && npx prisma generate && cd ..

# Push database schema (creates tables)
cd backend && npx prisma db push && cd ..

# Seed demo data
cd backend && npx tsx prisma/seed.ts && cd ..

# Start all 3 services in separate terminals:
# Terminal 1 — Backend API (port 4000)
cd backend && pnpm dev

# Terminal 2 — Frontend (port 3000)
cd frontend && pnpm dev

# Terminal 3 — Workers (optional, for queue processing)
cd workers && npx tsx src/comment.worker.ts
```

### 2.2 Demo credentials

After seeding, you can log in with:

- **Email:** `demo@socialpilot.ai`
- **Password:** `demo1234`

### 2.3 Infrastructure (if not using Docker)

Make sure these services are running locally:

```bash
# PostgreSQL
pg_isready -U postgres

# Redis
redis-cli ping

# Qdrant
curl http://localhost:6333/health
```

---

## 3. Docker Compose (All Services)

The `docker-compose.yml` orchestrates everything — database, cache, vector store, API, and workers.

### 3.1 Quick start

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f backend

# Stop all
docker compose down
```

### 3.2 Service overview

| Service | Image | Ports | Depends On |
|---------|-------|-------|------------|
| `postgres` | `postgres:16-alpine` | `5432` | — |
| `redis` | `redis:7-alpine` | `6379` | — |
| `qdrant` | `qdrant/qdrant:latest` | `6333`, `6334` | — |
| `backend` | custom (`Dockerfile.backend`) | `4000` | postgres, redis, qdrant |
| `comment-worker` | custom (`Dockerfile.worker`) | — | redis, backend |
| `dm-worker` | custom (`Dockerfile.worker`) | — | redis, backend |

### 3.3 Building images

```bash
# Build all images
docker compose build

# Build a specific service
docker compose build backend
```

### 3.4 Production compose

For production, create a `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: socialpilot
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/socialpilot
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - QDRANT_URL=http://qdrant:6333
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_started
    restart: unless-stopped

  comment-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: ["tsx", "workers/src/comment.worker.ts"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    env_file:
      - .env
    depends_on:
      - redis
      - backend
    restart: unless-stopped

  dm-worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    command: ["tsx", "workers/src/dm.worker.ts"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    env_file:
      - .env
    depends_on:
      - redis
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  qdrant_data:
```

Add an `nginx.conf` for routing:

```nginx
events {}

http {
  upstream backend {
    server backend:4000;
  }

  server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
      proxy_pass http://backend;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
      root /usr/share/nginx/html;
      try_files $uri /index.html;
    }
  }
}
```

---

## 4. Production Deployment (VPS)

### 4.1 Recommended VPS specs

| Tier | RAM | CPU | Storage | Use Case |
|------|-----|-----|---------|----------|
| Starter | 2 GB | 1 vCPU | 20 GB | Low traffic (< 10 accounts) |
| Standard | 4 GB | 2 vCPU | 40 GB | Moderate traffic (10-50 accounts) |
| High | 8 GB | 4 vCPU | 80 GB | Heavy traffic (50+ accounts) |

Recommended providers: Hetzner (best value), DigitalOcean, Linode, or OVH.

### 4.2 Manual deployment

```bash
# SSH into your VPS
ssh root@your-server-ip

# Install dependencies
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin nginx

# Clone the project
git clone <repo-url> /opt/socialpilot
cd /opt/socialpilot

# Configure environment
cp .env.example .env
nano .env   # Fill in all production values

# Create nginx config
nano /etc/nginx/sites-available/socialpilot
ln -s /etc/nginx/sites-available/socialpilot /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Set up SSL (Let's Encrypt)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com

# Start everything
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check logs
docker compose logs -f backend
```

### 4.3 Automated deployment script

Create `scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Deploying MetaPilot AI..."

# Pull latest code
git pull origin main

# Install dependencies
pnpm install

# Build shared packages
pnpm build:shared

# Generate Prisma client
cd backend && npx prisma generate && cd ..

# Run database migrations
cd backend && npx prisma db push && cd ..

# Build backend
pnpm build:backend

# Build frontend
pnpm build:frontend

# If using Docker:
# docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# If not using Docker:
# pm2 restart ecosystem.config.js

echo "✅ Deployment complete!"
```

### 4.4 Process manager (without Docker)

If running without Docker, use PM2:

```bash
# Install PM2
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'socialpilot-backend',
      cwd: './backend',
      script: 'dist/app.js',
      env: { NODE_ENV: 'production' },
      instances: 2,
      exec_mode: 'cluster',
    },
    {
      name: 'socialpilot-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'comment-worker',
      cwd: './workers',
      script: 'node_modules/.bin/tsx',
      args: 'src/comment.worker.ts',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'dm-worker',
      cwd: './workers',
      script: 'node_modules/.bin/tsx',
      args: 'src/dm.worker.ts',
      env: { NODE_ENV: 'production' },
    },
  ],
};
EOF

# Start everything
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 5. Cloud Platforms

### 5.1 Railway (Easiest)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables from `.env.example`
4. Add PostgreSQL, Redis plugins
5. Deploy

### 5.2 Render

1. Push to GitHub
2. Create a **Web Service**:
   - Build Command: `pnpm install && cd backend && npx prisma generate && pnpm build`
   - Start Command: `cd backend && node dist/app.js`
3. Create a **Static Site** for frontend:
   - Build Command: `cd frontend && pnpm install && pnpm build`
   - Publish Directory: `frontend/out`
4. Add **Redis** service
5. Use **Neon** or **Supabase** for managed PostgreSQL

### 5.3 Fly.io

```bash
# Install flyctl
curl -fsSL https://fly.io/install.sh | sh

# Launch the backend
cd backend
fly launch --name socialpilot-api
fly secrets set DATABASE_URL=... REDIS_URL=... OPENAI_API_KEY=...
fly deploy

# Launch the frontend
cd ../frontend
fly launch --name socialpilot-app --build-arg NEXT_PUBLIC_API_URL=https://socialpilot-api.fly.dev
fly deploy
```

### 5.4 AWS (Advanced)

**Services needed:**
- **ECS Fargate** or **EC2** — Backend API + Workers
- **RDS PostgreSQL** — Database
- **ElastiCache Redis** — Queue
- **CloudFront** + **S3** — Frontend hosting
- **Certificate Manager** — SSL
- **Route 53** — DNS

See `aws/` directory for CloudFormation templates (not yet created).

---

## 6. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Backend server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `JWT_SECRET` | **Yes** | — | Random string for JWT signing |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiration |
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `META_APP_ID` | Conditional* | — | Meta App ID for OAuth |
| `META_APP_SECRET` | Conditional* | — | Meta App Secret |
| `META_WEBHOOK_VERIFY_TOKEN` | No | — | Webhook verification token |
| `META_CALLBACK_URL` | Conditional* | — | OAuth callback URL |
| `QDRANT_URL` | No | `http://localhost:6333` | Qdrant connection URL |
| `QDRANT_API_KEY` | No | — | Qdrant API key |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID (frontend) |
| `SUPABASE_URL` | Conditional* | — | Supabase Storage URL |
| `SUPABASE_ANON_KEY` | Conditional* | — | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Conditional* | — | Supabase service role key |
| `SUPABASE_BUCKET` | No | `socialpilot` | Storage bucket name |
| `RESEND_API_KEY` | No | — | Resend API key for emails |
| `EMAIL_FROM` | No | `noreply@socialpilot.ai` | Sender email |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL (CORS) |
| `COMMENT_QUEUE_DELAY_MIN` | No | `45000` | Min delay (ms) for comment replies |
| `COMMENT_QUEUE_DELAY_MAX` | No | `90000` | Max delay (ms) for comment replies |

> `*` Conditional = required if that feature is enabled

---

## 7. Health Checks & Monitoring

### 7.1 Health endpoints

```bash
# Backend health
curl http://localhost:4000/health

# Qdrant health
curl http://localhost:6333/health

# Redis health
redis-cli -h localhost ping

# PostgreSQL health
pg_isready -h localhost -U postgres
```

### 7.2 Backend health check response

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "0.1.0",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected",
  "memory": { "heapUsed": 12345678, "heapTotal": 23456789 }
}
```

### 7.3 Docker health checks

The Docker Compose configuration includes health checks for PostgreSQL and Redis. Monitor with:

```bash
docker compose ps
docker compose events
docker compose logs --tail=50 -f
```

### 7.4 Monitoring recommendations

| Tool | Purpose |
|------|---------|
| **Uptime Kuma** | Self-hosted uptime monitoring |
| **Better Stack** | Cloud uptime + incident management |
| **Grafana + Prometheus** | Advanced metrics (if using Docker) |
| **Sentry** | Error tracking |
| **Logtail** or **Axiom** | Centralized logging |

---

## 8. Troubleshooting

### 8.1 Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ECONNREFUSED` on startup | PostgreSQL/Redis not running | Start the service or Docker containers |
| `PrismaClientInitializationError` | Database not created | Run `npx prisma db push` |
| `JWT_SECRET is not set` | Missing env variable | Set `JWT_SECRET` in `.env` |
| `Cannot find module '@socialpilot/shared'` | Shared package not built | Run `pnpm build:shared` |
| `TypeError: collections is of type 'unknown'` | TypeScript strict mode | Fixed in code — ensure latest build |
| `OAuth callback URL mismatch` | Meta App configuration | Check `META_CALLBACK_URL` matches Meta App settings |
| `401 from OpenAI API` | Invalid or expired key | Check `OPENAI_API_KEY` in `.env` |
| `BullMQ connection timeout` | Redis unreachable | Check `REDIS_URL` and Redis service status |

### 8.2 Docker-specific issues

```bash
# Docker daemon not running
systemctl start docker   # Linux
# or start Docker Desktop  # macOS / Windows

# Port conflict
docker compose down
# Change the conflicting port in docker-compose.yml, then start again

# Container keeps restarting
docker compose logs <service-name>
# Look for startup errors in the logs

# Image build fails
docker compose build --no-cache <service-name>
```

### 8.3 Database issues

```bash
# Reset the database (⚠️ destroys all data)
cd backend && npx prisma db push --force-reset --accept-data-loss

# View database
npx prisma studio

# Generate migration (instead of db push)
npx prisma migrate dev --name init

# Run migration in production
npx prisma migrate deploy
```

### 8.4 Getting help

- **GitHub Issues:** Create an issue in the repository
- **Internal:** Check `CLIFF.md` for project architecture context

---

## Appendix: Quick Reference

```bash
# ── Setup ──
cp .env.example .env
pnpm install
cd backend && npx prisma generate && npx prisma db push
cd backend && npx tsx prisma/seed.ts

# ── Development ──
cd backend && pnpm dev                    # API at :4000
cd frontend && pnpm dev                   # App at :3000
cd workers && npx tsx src/comment.worker.ts

# ── Docker ──
docker compose up -d                       # All services
docker compose logs -f backend             # Follow API logs
docker compose down                        # Stop everything

# ── Type Checking ──
cd backend && npx tsc --noEmit             # Backend types
cd frontend && npx tsc --noEmit            # Frontend types
cd workers && npx tsc --noEmit             # Workers types

# ── Production Deployment ──
cp .env.example .env                       # Configure for production
pnpm build:shared                          # Build shared packages
pnpm build:backend                         # Build backend
pnpm build:frontend                        # Build frontend
pm2 start ecosystem.config.js              # Start with PM2
```
