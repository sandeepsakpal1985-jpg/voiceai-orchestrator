#!/bin/bash
# MetaPilot AI — Production Deploy Script
#
# Usage: ./deploy/deploy.sh [environment]
#   environment: production (default) | staging
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - SSL certificates set up (run setup-ssl.sh first)
#   - .env.prod file configured with production secrets

set -euo pipefail

ENVIRONMENT="${1:-production}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
PROJECT_DIR="/opt/socialpilot"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${PROJECT_DIR}/backups/${TIMESTAMP}"

echo "🚀 MetaPilot AI — Deploying to ${ENVIRONMENT}..."

# ── 1. Verify prerequisites ──
if [ ! -f ".env.prod" ]; then
  echo "❌ .env.prod file not found. Create it from deploy/.env.prod.example"
  exit 1
fi

if [ ! -d "deploy/ssl" ]; then
  echo "⚠️  SSL directory not found. Run ./deploy/setup-ssl.sh first if using HTTPS."
fi

# ── 2. Create backup ──
echo "📦 Creating database backup..."
mkdir -p "${BACKUP_DIR}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_dump -U postgres socialpilot > "${BACKUP_DIR}/db_dump.sql" 2>/dev/null || echo "⚠️  Could not backup database (first deploy?)"

# ── 3. Pull latest images ──
echo "📥 Pulling latest images..."
docker compose -f "${COMPOSE_FILE}" pull

# ── 4. Build and start services ──
echo "🏗️  Building and starting services..."
docker compose -f "${COMPOSE_FILE}" up -d --build

# ── 5. Run database migrations ──
echo "🗃️  Running database migrations..."
docker compose -f "${COMPOSE_FILE}" exec -T backend npx prisma migrate deploy || {
  echo "⚠️  Migration failed. Rolling back..."
  docker compose -f "${COMPOSE_FILE}" down
  # Restore previous version
  docker compose -f "${COMPOSE_FILE}" up -d
  exit 1
}

# ── 6. Seed demo data (first deploy only) ──
if [ ! -f "${PROJECT_DIR}/.deployed" ]; then
  echo "🌱 Seeding demo data..."
  docker compose -f "${COMPOSE_FILE}" exec -T backend npx prisma db seed || echo "⚠️  Seeding skipped"
  touch "${PROJECT_DIR}/.deployed"
fi

# ── 7. Verify health ──
echo "🏥 Verifying health..."
sleep 5
if curl -sf http://localhost:4000/health > /dev/null 2>&1; then
  echo "✅ Backend is healthy!"
else
  echo "⚠️  Health check failed. Check logs: docker compose -f ${COMPOSE_FILE} logs backend"
fi

# ── 8. Clean up old images ──
echo "🧹 Cleaning up old images..."
docker image prune -f

echo ""
echo "✅ Deploy complete!"
echo "   Frontend: https://yourdomain.com"
echo "   API:      https://api.yourdomain.com"
echo "   Backup:   ${BACKUP_DIR}/db_dump.sql"
echo ""
echo "To check logs:"
echo "  docker compose -f ${COMPOSE_FILE} logs -f"
