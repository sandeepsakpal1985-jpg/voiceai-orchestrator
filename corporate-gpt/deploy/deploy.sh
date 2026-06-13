#!/bin/bash
# CorporateGPT Production Deployment
set -e

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example to .env and configure."
  exit 1
fi

echo "Starting CorporateGPT deployment..."

# Backup
docker-compose -f deploy/docker-compose.prod.yml exec postgres pg_dump -U corpgpt corpgpt > backup_$(date +%Y%m%d_%H%M%S).sql 2>/dev/null || true

# Pull latest
git pull origin main

# Build and start
docker-compose -f deploy/docker-compose.prod.yml build --pull
docker-compose -f deploy/docker-compose.prod.yml up -d

# Migrations
docker-compose -f deploy/docker-compose.prod.yml exec backend alembic upgrade head

# Health check
echo "Waiting for services..."
sleep 10
curl -f http://localhost:8000/api/v1/health && echo " - Backend OK"
curl -f http://localhost:3000 && echo " - Frontend OK"

echo "Deployment complete!"
