# MetaPilot AI — Production Deployment Guide

## Overview

This guide covers deploying MetaPilot AI to production on a VPS (Ubuntu 22.04+).
The application consists of 7 services orchestrated with Docker Compose.

## Architecture

```
┌─────────┐     ┌──────────┐     ┌───────────┐
│  Client  │────▶│  Nginx   │────▶│ Frontend  │
│ (HTTPS)  │     │ (Proxy)  │     │ (Next.js) │
└─────────┘     └──────────┘     └───────────┘
                      │                   │
                      ▼                   ▼
               ┌──────────┐     ┌───────────┐
               │  Certbot  │     │  Backend  │
               │  (SSL)    │     │ (Fastify) │
               └──────────┘     └───────────┘
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │PostgreSQL│ │  Redis   │ │  Qdrant  │
                    └──────────┘ └──────────┘ └──────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                    ┌──────────┐             ┌──────────┐
                    │Comment   │             │ DM       │
                    │Worker    │             │ Worker   │
                    └──────────┘             └──────────┘
```

## Prerequisites

- **VPS:** Ubuntu 22.04+, 4GB+ RAM, 2+ CPU cores, 50GB+ SSD
- **Domain:** Pointed to your VPS IP (e.g., `app.yourdomain.com`, `api.yourdomain.com`)
- **Docker & Compose:** Installed (see below)
- **Email:** Resend API key for transactional emails
- **Payment:** Razorpay account for billing

## Quick Deploy (One Command)

```bash
# SSH into your VPS, then:
git clone https://github.com/yourorg/socialpilot.git
cd socialpilot
cp deploy/.env.prod.example .env
nano .env   # Fill in all secrets
bash deploy/deploy.sh
```

## Step-by-Step Deployment

### 1. VPS Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Add your user to docker group
sudo usermod -aG docker $USER

# Logout and back in for group changes to take effect
exit
# ssh back in
```

### 2. Configure Environment

```bash
cp deploy/.env.prod.example .env
```

**Required variables:**

| Variable | Description | Source |
|----------|-------------|--------|
| `DATABASE_URL` | PostgreSQL connection string | Generate |
| `REDIS_URL` | Redis connection string | Generate |
| `JWT_SECRET` | 64-char random hex string | `openssl rand -hex 32` |
| `NEXT_PUBLIC_API_URL` | Backend URL (e.g., `https://api.yourdomain.com`) | Your domain |
| `NEXT_PUBLIC_APP_URL` | Frontend URL (e.g., `https://app.yourdomain.com`) | Your domain |
| `RESEND_API_KEY` | Transactional email API key | [Resend](https://resend.com) |
| `RAZORPAY_KEY_ID` | Razorpay API key | [Razorpay](https://razorpay.com) |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Razorpay |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing secret | Razorpay |
| `POSTHOG_API_KEY` | Product analytics | [PostHog](https://posthog.com) |
| `SENTRY_DSN` | Error monitoring | [Sentry](https://sentry.io) |

### 3. SSL Certificate

```bash
# Make the script executable
chmod +x deploy/setup-ssl.sh

# Run with your domain
sudo bash deploy/setup-ssl.sh app.yourdomain.com api.yourdomain.com
```

This will:
- Install certbot
- Obtain Let's Encrypt certificates (auto-renew via cron)
- Place certs in `/etc/letsencrypt/live/`

### 4. Deploy

```bash
bash deploy/deploy.sh
```

This single command:
1. Backs up the current database (`./backups/`)
2. Pulls latest code from git
3. Builds all Docker images
4. Stops old containers
5. Starts production stack
6. Runs database migrations (`prisma db push`)
7. Seeds demo data on first deploy
8. Runs health checks on all services
9. Cleans up old images

### 5. Verify Deployment

```bash
# Check all services are running
docker compose -f deploy/docker-compose.prod.yml ps

# Check health endpoint
curl https://api.yourdomain.com/health

# Check frontend
curl -I https://app.yourdomain.com

# View logs
docker compose -f deploy/docker-compose.prod.yml logs -f
```

## Production Docker Compose

File: `deploy/docker-compose.prod.yml`

| Service | Image/Config | Port | Healthcheck |
|---------|-------------|------|-------------|
| `nginx` | nginx:alpine | 80/443 | TCP 80 |
| `certbot` | certbot/certbot | — | — |
| `frontend` | Dockerfile.frontend | 3000 | TCP 3000 |
| `backend` | Dockerfile.backend | 4000 | GET /health |
| `postgres` | postgres:16-alpine | 5432 | pg_isready |
| `redis` | redis:7-alpine | 6379 | redis ping |
| `qdrant` | qdrant/qdrant | 6333 | GET /health |
| `comment-worker` | Dockerfile.backend | — | — |
| `dm-worker` | Dockerfile.backend | — | — |

All services share a `socialpilot-net` network and `.env` file.

## Nginx Configuration

File: `deploy/nginx.conf`

- **HTTP → HTTPS redirect** — All traffic forced to SSL
- **SSL termination** — TLSv1.2/1.3 with modern ciphers
- **Rate limiting** — 30 req/s for API, 100 req/s for webhooks
- **Security headers** — HSTS, X-Content-Type-Options, X-Frame-Options, CSP
- **Static caching** — Frontend assets cached for 1 year
- **Separate subdomains** — `app.yourdomain.com` → frontend, `api.yourdomain.com` → backend

## Database

### Backup

Automatic backup is included in `deploy.sh`. Manual backup:

```bash
# Backup
docker exec socialpilot-postgres-1 pg_dump -U socialpilot socialpilot > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20250301.sql | docker exec -i socialpilot-postgres-1 psql -U socialpilot socialpilot
```

### Migrations

```bash
# Apply schema changes
docker compose -f deploy/docker-compose.prod.yml exec backend npx prisma db push

# Generate Prisma client
docker compose -f deploy/docker-compose.prod.yml exec backend npx prisma generate
```

## Monitoring

### Health Checks

| Endpoint | Description |
|----------|-------------|
| `/health` | Backend health — returns `{"status":"ok"}` |
| `/api/admin/health` | Full system health (PostHog, Sentry, queues) |

### Logs

```bash
# All services
docker compose -f deploy/docker-compose.prod.yml logs -f

# Specific service
docker compose -f deploy/docker-compose.prod.yml logs -f backend

# Last N lines
docker compose -f deploy/docker-compose.prod.yml logs --tail=100 backend
```

### Log Rotation

Docker's built-in log rotation is configured in `docker-compose.prod.yml`:
- Max size: 10MB per log file
- Max files: 3 rotations

## Scaling

### Vertical Scaling (Single VPS)

| Scale | Specs | Monthly Est. |
|-------|-------|-------------|
| Starter | 2 CPU, 4GB RAM, 50GB SSD | $15-25 |
| Growth | 4 CPU, 8GB RAM, 100GB SSD | $40-60 |
| Scale | 8 CPU, 16GB RAM, 200GB SSD | $80-120 |

### Horizontal Scaling (Multi-VPS)

For high-traffic deployments:
1. Separate frontend to CDN (Vercel, Cloudflare)
2. Use managed PostgreSQL (Supabase, Aiven)
3. Use managed Redis (Upstash)
4. Scale workers independently

## Backup & Restore

### Automated Backup Schedule (Recommended)

```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * cd /opt/socialpilot && docker exec socialpilot-postgres-1 pg_dump -U socialpilot socialpilot > backups/daily_$(date +\%Y\%m\%d).sql && find backups/ -name "daily_*" -mtime +30 -delete
```

### Restore Procedure

```bash
# 1. Stop services
docker compose -f deploy/docker-compose.prod.yml down

# 2. Restore database
docker run --rm -i -v socialpilot_postgres_data:/var/lib/postgresql/data postgres:16-alpine bash -c "
  rm -rf /var/lib/postgresql/data/*
  docker-entrypoint.sh postgres &
  sleep 5
  psql -U socialpilot -d socialpilot < backup_file.sql
"

# 3. Restart
docker compose -f deploy/docker-compose.prod.yml up -d
```

## Security Checklist

- [ ] SSL enabled (Let's Encrypt auto-renewal)
- [ ] Rate limiting configured (30 req/s API, 100 req/s webhooks)
- [ ] Security headers set (CSP, HSTS, XSS protection)
- [ ] PostgreSQL password set in `.env`
- [ ] Redis password set in `.env`
- [ ] JWT_SECRET is strong random value
- [ ] Razorpay webhook signature verification enabled
- [ ] Sentry error monitoring enabled
- [ ] Regular database backups configured
- [ ] Docker containers run as non-root users
- [ ] Firewall configured (allow only 80/443/22)

## Troubleshooting

### Service won't start

```bash
# Check logs
docker compose -f deploy/docker-compose.prod.yml logs backend

# Check if port is in use
sudo netstat -tulpn | grep 4000

# Restart service
docker compose -f deploy/docker-compose.prod.yml restart backend
```

### Database connection refused

```bash
# Check PostgreSQL status
docker compose -f deploy/docker-compose.prod.yml ps postgres

# Verify DATABASE_URL in .env
grep DATABASE_URL .env

# Check PostgreSQL logs
docker compose -f deploy/docker-compose.prod.yml logs postgres
```

### SSL certificate expired

```bash
# Manual renewal
sudo docker compose -f deploy/docker-compose.prod.yml run --rm certbot renew

# Check expiration
echo | openssl s_client -servername app.yourdomain.com -connect app.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Frontend shows blank page

```bash
# Check if frontend is running
docker compose -f deploy/docker-compose.prod.yml ps frontend

# Check NEXT_PUBLIC_API_URL in .env
grep NEXT_PUBLIC_API_URL .env

# Clear browser cache and hard reload (Ctrl+Shift+R)
```

## Updating

```bash
# Pull latest code
git pull origin main

# Re-deploy
bash deploy/deploy.sh
```

## Rollback

```bash
# Revert to previous commit
git checkout <previous-tag>

# Re-deploy
bash deploy/deploy.sh

# Restore database if needed
bash deploy/restore.sh backups/daily_20250301.sql
```
