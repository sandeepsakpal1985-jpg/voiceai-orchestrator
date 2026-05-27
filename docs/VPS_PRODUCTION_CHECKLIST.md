# VoiceAI Orchestrator — VPS Production Deployment Checklist

> Production-ready checklist for deploying to Hetzner, OVH, or bare-metal GPU servers.
> Last updated: 2026-05-27

---

## 1. Server Provisioning

### Hardware Requirements

| Tier | CPU | RAM | Storage | GPU | Estimated Cost |
|------|-----|-----|---------|-----|----------------|
| **Minimal** (softphone/test) | 4 vCPU | 8 GB | 50 GB | None | ~$10-20/mo |
| **Standard** (production) | 8 vCPU | 32 GB | 200 GB | None | ~$30-60/mo |
| **GPU** (high-quality TTS/STT) | 16 vCPU | 64 GB | 500 GB | NVIDIA T4/A10G | ~$100-400/mo |

**Recommendations:**
- **CPU-only**: Hetzner CX52 (8 vCPU, 32 GB) — ~€35/mo
- **GPU**: RunPod RTX 4090 or Hetzner GPU + 4x HDD RAID10
- **Disk**: Always use SSD/NVMe — no spinning disks

### OS Setup

```bash
# Ubuntu 24.04 LTS (recommended)
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
    curl wget git htop iotop net-tools \
    ufw fail2ban unattended-upgrades \
    docker.io docker-compose-plugin \
    nvidia-container-toolkit  # if GPU
```

---

## 2. Docker Configuration

### `.env` File Template

```bash
# ============================================================================
# Production .env — copy to server as /opt/voiceai/.env
# ============================================================================

# --- Providers (local-first) ---
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro

# --- LiveKit ---
LIVEKIT_ENABLED=true
LIVEKIT_URL=ws://livekit-server:7880
LIVEKIT_API_KEY=<generate-secure-key-32-chars>
LIVEKIT_API_SECRET=<generate-secure-secret-64-chars>

# --- Database ---
DATABASE_URL=postgresql://voiceai:<db-password>@postgres:5432/voiceai
REDIS_URL=redis://redis:6379

# --- Ollama ---
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:7b

# --- Auth ---
AUTH_SECRET=<generate-64-char-random-secret>

# --- Rate Limiting ---
RATE_LIMIT_REQUESTS=200
RATE_LIMIT_WINDOW_SEC=60

# --- Audio Cache ---
AUDIO_CACHE_ENABLED=true
AUDIO_CACHE_TTL=86400
AUDIO_CACHE_MAX_MEMORY=2000
```

### Generate Secrets

```bash
# Run this once and save to .env
echo "LIVEKIT_API_KEY=$(openssl rand -hex 16)"
echo "LIVEKIT_API_SECRET=$(openssl rand -hex 32)"
echo "AUTH_SECRET=$(openssl rand -hex 32)"
echo "DB_PASSWORD=$(openssl rand -hex 16)"
```

### `livekit.yaml` (Production)

```yaml
# /opt/voiceai/livekit.yaml
port: 7880
rtc:
  port_range:
    start: 7882
    end: 7882
  tcp_port: 7881
  use_external_ip: true
  public_ip: <SERVER_PUBLIC_IP>
  stun_servers:
    - stun:stun.l.google.com:19302
    - stun:stun1.l.google.com:19302
keys:
  <LIVEKIT_API_KEY>: <LIVEKIT_API_SECRET>
turn:
  enabled: true
  domain: <your-domain.com>
  tls_port: 5349
  cert_file: /etc/letsencrypt/live/<your-domain.com>/fullchain.pem
  key_file: /etc/letsencrypt/live/<your-domain.com>/privkey.pem
```

---

## 3. Networking & Security

### Firewall (UFW)

```bash
# Essential ports only
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh              # Port 22
sudo ufw allow 80/tcp           # HTTP (Let's Encrypt)
sudo ufw allow 443/tcp          # HTTPS (API + Dashboard)
sudo ufw allow 7880/tcp         # LiveKit WebSocket
sudo ufw allow 7881/tcp         # LiveKit TCP
sudo ufw allow 7882/udp         # LiveKit ICE/UDP
sudo ufw allow 5349/tcp         # LiveKit TURN/TLS
sudo ufw allow 5060/udp         # SIP (Twilio)
sudo ufw allow 5060/tcp         # SIP (TCP fallback)
sudo ufw --force enable
```

### SSL with Let's Encrypt

```bash
# Install certbot
sudo apt-get install -y certbot

# Get certificate
sudo certbot certonly --standalone -d api.your-domain.com
sudo certbot certonly --standalone -d livekit.your-domain.com

# Auto-renew
sudo crontab -e
# Add: 0 3 * * * /usr/bin/certbot renew --quiet
```

### Reverse Proxy (Caddy or Nginx)

**Caddy (recommended — auto HTTPS):**

```caddyfile
# /etc/caddy/Caddyfile
api.your-domain.com {
    reverse_proxy localhost:8000
}

livekit.your-domain.com {
    reverse_proxy localhost:7880
}

dashboard.your-domain.com {
    reverse_proxy localhost:3000
}
```

### Fail2Ban

```bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl restart fail2ban
```

---

## 4. Deployment Commands

### First-Time Setup

```bash
# Create project directory
sudo mkdir -p /opt/voiceai
cd /opt/voiceai

# Clone repository
git clone https://github.com/your-org/voiceai-orchestrator.git .
git checkout master

# Create .env and configure
cp .env.example .env
# EDIT .env with production values

# Pull models (do this before starting services)
docker compose run --rm ollama ollama pull qwen2.5:7b

# Start services
bash scripts/up.sh
```

### Health Verification

```bash
# Check all services
docker compose ps

# Health endpoints
curl -s http://localhost:8000/health | jq .
curl -s http://localhost:8000/health/deep | jq .

# LiveKit status
curl -s http://localhost:7880/ | jq .

# Check logs
docker compose logs --tail=50 voiceai-api
```

### Database Migrations

```bash
# The app uses asyncpg/SQLAlchemy with auto-schema creation on first start.
# Manual migration if needed:
docker compose exec voiceai-api alembic upgrade head
```

---

## 5. Monitoring & Observability

### Health Check Endpoints

| Endpoint | Purpose | Expected Status |
|----------|---------|-----------------|
| `GET /health` | Basic liveness | 200 OK |
| `GET /health/liveness` | K8s liveness probe | 200 OK |
| `GET /health/readiness` | K8s readiness probe | 200 OK |
| `GET /health/deep` | Full dependency check | 200 + per-service breakdown |
| `GET /metrics` | Prometheus metrics | 200 + metric lines |

### Prometheus / Grafana (Optional)

```bash
# Add to docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
```

**Prometheus config (`prometheus.yml`):**

```yaml
scrape_configs:
  - job_name: 'voiceai-api'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'
```

### Logging

```bash
# Configure log rotation
# /etc/logrotate.d/voiceai
/opt/voiceai/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### Key Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| HTTP 5xx rate | > 1% over 5 min | Check provider health |
| API latency (p95) | > 5s | Scale up or check Ollama |
| LiveKit reconnections | > 3/min | Check network/WebRTC |
| Memory usage | > 85% | Increase RAM or restart |
| Disk usage | > 80% | Clean logs, expand volume |

---

## 6. Scaling Strategy

### Vertical Scaling (Single Node)

| Component | Bottleneck | Upgrade Path |
|-----------|-----------|--------------|
| **Ollama** (LLM) | RAM/VRAM | 32 GB→64 GB or add GPU |
| **Whisper** (STT) | CPU/GPU | Add GPU for float16 |
| **LiveKit** | CPU/Bandwidth | 8→16 vCPU, more ports |
| **Postgres** | Disk I/O | NVMe → RAID10 |

### Horizontal Scaling (Multi-Node)

For high-volume production (>500 concurrent calls):

1. **Dedicated DB node**: Postgres + Redis on separate server
2. **LiveKit cluster**: Multiple LiveKit nodes behind a load balancer
3. **Worker pool**: Multiple `voiceai-worker` containers with different GPU assignments
4. **API replicas**: `docker compose up -d --scale voiceai-api=3`

### GPU Pooling

```
voiceai-api-gpu (CUDA Whisper)    → GPU 0
voiceai-worker-gpu (CUDA TTS)     → GPU 1  
ollama (LLM inference)             → GPU 2
```

---

## 7. Backup & Recovery

```bash
# Database backup
docker exec voiceai-postgres pg_dump -U voiceai voiceai > /backups/db_$(date +%Y%m%d).sql

# Cron job (daily at 2 AM)
0 2 * * * /opt/voiceai/scripts/backup.sh

# Audio cache (optional, can be regenerated)
tar -czf /backups/audio_$(date +%Y%m%d).tar.gz /opt/voiceai/audio
```

### Recovery Sequence

```bash
# Restore from backup
docker compose down
docker compose up -d postgres
sleep 5
cat /backups/db_20260527.sql | docker exec -i voiceai-postgres psql -U voiceai voiceai
docker compose up -d
```

---

## 8. Production Verification (Pre-Launch Checklist)

```bash
# [ ] OS updated
# [ ] Docker installed and running
# [ ] .env configured with secrets
# [ ] livekit.yaml configured with public IP
# [ ] SSL certificates installed
# [ ] Firewall rules applied
# [ ] Fail2Ban running
# [ ] Services start: docker compose up -d
# [ ] Health check passes: curl localhost:8000/health
# [ ] Deep health passes: curl localhost:8000/health/deep
# [ ] Ollama model pulled: curl localhost:11434/api/tags
# [ ] LiveKit reachable: curl localhost:7880/
# [ ] LiveKit E2E tests pass: pytest app/__tests__/test_livekit_e2e.py -v
# [ ] All 558 backend tests pass: python -m pytest app/__tests__/ -q
# [ ] All 216 dashboard tests pass: npx vitest run
# [ ] API endpoints respond: curl localhost:8000/providers
# [ ] WebSocket connects (via dashboard)
# [ ] Log rotation configured
# [ ] Backups set up
```

> ✅ **Full production readiness achieved when all boxes are checked.**

---

## Appendix: Quick Commands Reference

```bash
# Start everything
docker compose up -d

# Stop everything  
docker compose down

# View logs (all services)
docker compose logs -f

# View logs (single service)
docker compose logs -f voiceai-api

# Restart a service
docker compose restart voiceai-api

# Run tests inside container
docker compose exec voiceai-api python -m pytest app/__tests__/ -q

# Scale workers
docker compose up -d --scale voiceai-worker=3

# GPU profile
docker compose --profile gpu up -d

# Minimal profile (dev)
docker compose -f docker-compose.yml up -d postgres ollama
```
