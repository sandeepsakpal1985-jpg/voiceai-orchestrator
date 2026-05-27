# Hetzner VPS Deployment — Action Plan

> **Target:** Deploy VoiceAI Orchestrator to Hetzner Cloud in under 30 minutes.
> **Instance:** CX52 (8 vCPU, 32 GB RAM, €35/mo) — CPU-only, production-ready for 10-20 concurrent calls.

---

## Quick-Start (10-Minute Deploy)

> **⚠️ Prerequisites:** Before running this, replace `your-org` below with your actual GitHub org/repo.
> Example: `git clone https://github.com/your-company/voiceai-orchestrator.git`

Run this on your local machine to provision a Hetzner server:

```bash
# 1. Create server via Hetzner CLI
hcloud server create \
  --name voiceai-prod \
  --type cx52 \
  --image ubuntu-24.04 \
  --ssh-key your-ssh-key-name

# 2. Get the IP
SERVER_IP=$(hcloud server ip voiceai-prod)
echo "Server IP: $SERVER_IP"

# 3. SSH in and run the auto-setup
ssh root@$SERVER_IP
```

Then paste this entire block on the fresh server:

```bash
# ============================================================================
# ONE-SHOT SETUP — paste on fresh Ubuntu 24.04 Hetzner server
# ============================================================================
set -euo pipefail

# ── System Update & Dependencies ──
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git ufw fail2ban \
  docker.io docker-compose-plugin unattended-upgrades

# ── Generate Secrets ──
LIVEKIT_KEY=$(openssl rand -hex 16)
LIVEKIT_SECRET=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

# ── Clone Repository ──
# !! IMPORTANT: Replace 'your-org' with your actual GitHub org/repo below !!
mkdir -p /opt/voiceai && cd /opt/voiceai
git clone https://github.com/your-org/voiceai-orchestrator.git .
git checkout master

# ── Create .env ──
cat > .env << 'EOF'
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro
LIVEKIT_ENABLED=true
LIVEKIT_URL=ws://livekit-server:7880
OLLAMA_BASE_URL=http://ollama:11434
DATABASE_URL=postgresql://voiceai:voiceai@postgres:5432/voiceai
REDIS_URL=redis://redis:6379
RATE_LIMIT_REQUESTS=200
RATE_LIMIT_WINDOW_SEC=60
AUDIO_CACHE_ENABLED=true
AUDIO_CACHE_TTL=86400
AUDIO_CACHE_MAX_MEMORY=2000
EOF

echo "LIVEKIT_API_KEY=$LIVEKIT_KEY" >> .env
echo "LIVEKIT_API_SECRET=$LIVEKIT_SECRET" >> .env
echo "AUTH_SECRET=$AUTH_SECRET" >> .env

# ── Configure livekit.yaml ──
cat > livekit.yaml << 'LKYAML'
port: 7880
bind_addresses:
  - "0.0.0.0"
keys:
  ${LIVEKIT_KEY}: ${LIVEKIT_SECRET}
rtc:
  port_range_start: 7882
  port_range_end: 7882
  udp_port: 7882
  tcp_port: 7882
  use_external_ip: true
redis:
  address: "redis:6379"
log_level: info
room:
  enabled_codecs:
    - mime: audio/opus
    - mime: audio/red
  max_participants: 10
  empty_timeout: 300
LKYAML

# ── Update livekit.yaml with actual keys ──
# Using # as sed delimiter because keys are hex-only (0-9 a-f) — safe from special chars
sed -i "s#\${LIVEKIT_KEY}#$LIVEKIT_KEY#g" livekit.yaml
sed -i "s#\${LIVEKIT_SECRET}#$LIVEKIT_SECRET#g" livekit.yaml

# ── Configure Firewall ──
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7880/tcp
ufw allow 7881/tcp
ufw allow 7882/udp
ufw --force enable

# ── Configure Fail2Ban ──
systemctl enable fail2ban
systemctl start fail2ban

# ── Pull Ollama Model ──
docker compose run --rm ollama ollama pull qwen2.5:7b 2>&1 | tail -5

# ── Start Services (including redis + dashboard via --profile full) ──
docker compose --profile full up -d

# ── Wait for services ──
echo "Waiting for services..."
sleep 15

# ── Get public IP dynamically ──
PUBLIC_IP=$(curl -sf ifconfig.me || echo "<your-server-ip>")

# ── Verify ──
echo ""
echo "=== SERVICE STATUS ==="
docker compose ps

echo ""
echo "=== HEALTH CHECK ==="
curl -sf http://localhost:8000/health | python3 -m json.tool || echo "FAILED"

echo ""
echo "=== DEEP HEALTH ==="
curl -sf http://localhost:8000/health/deep | python3 -m json.tool || echo "FAILED"

echo ""
echo "=== COMPLETE ==="
echo "API:      http://$PUBLIC_IP:8000"
echo "LiveKit:  ws://$PUBLIC_IP:7880"
echo "Dashboard: http://$PUBLIC_IP:3000"
echo "Secrets saved to /opt/voiceai/.env"
```

---

## Step-by-Step Action Plan

### Phase 1: Provision (5 min)

| Action | Command | Expected Result |
|--------|---------|-----------------|
| Create Hetzner server | `hcloud server create --name voiceai-prod --type cx52 --image ubuntu-24.04` | Server IP returned |
| Wait for boot | `hcloud server wait voiceai-prod` | Server ready |
| SSH in | `ssh root@<SERVER_IP>` | Login prompt |

**Manual alternative** (no hcloud CLI):
1. Go to [Hetzner Console](https://console.hetzner.cloud)
2. Create new project → Add server
3. Select CX52 → Ubuntu 24.04 → Add SSH key → Create

### Phase 2: System Setup (5 min)

| # | Action | Command |
|---|--------|---------|
| 1 | Update packages | `apt-get update && apt-get upgrade -y` |
| 2 | Install Docker | `apt-get install -y docker.io docker-compose-plugin` |
| 3 | Install security tools | `apt-get install -y ufw fail2ban unattended-upgrades` |
| 4 | Configure unattended upgrades | `dpkg-reconfigure --priority=low unattended-upgrades` |

### Phase 3: Deploy App (8 min)

| # | Action | Command |
|---|--------|---------|
| 1 | Clone repo | `git clone https://github.com/your-org/voiceai-orchestrator.git /opt/voiceai` |
| 2 | Set `.env` | Copy from template, generate secrets (see Quick-Start above) |
| 3 | Configure `livekit.yaml` | Set `public_ip` to server IP, update keys |
| 4 | Pull Ollama model | `docker compose run --rm ollama ollama pull qwen2.5:7b` |
| 5 | Start all services | `docker compose up -d` |
| 6 | Run smoke tests | `pytest app/__tests__/test_health.py -q` |

### Phase 4: Security Hardening (5 min)

| # | Action | Command |
|---|--------|---------|
| 1 | Enable UFW | `ufw --force enable` |
| 2 | SSH key only | `sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd` |
| 3 | Enable Fail2Ban | `systemctl enable --now fail2ban` |
| 4 | Configure logwatch | `apt-get install -y logwatch && logwatch --detail High --mailto admin@your-domain.com --service All --range today` |
| 5 | Set up automatic security updates | `systemctl enable --now unattended-upgrades` |

### Phase 5: SSL + Domain (10 min)

**Prerequisites:** A domain name pointing to your server IP.

```bash
# Install Caddy (auto HTTPS)
apt-get install -y caddy

# /etc/caddy/Caddyfile
cat > /etc/caddy/Caddyfile << 'CADDY'
api.voiceai.yourdomain.com {
    reverse_proxy localhost:8000
    header / {
        Access-Control-Allow-Origin *
    }
}

livekit.voiceai.yourdomain.com {
    reverse_proxy localhost:7880
}

dashboard.voiceai.yourdomain.com {
    reverse_proxy localhost:3000
}
CADDY

systemctl restart caddy
```

Caddy automatically provisions Let's Encrypt certificates.

### Phase 6: Verification (2 min)

Run the full verification suite:

```bash
# Quick health
curl -sf https://api.voiceai.yourdomain.com/health | jq .
curl -sf https://api.voiceai.yourdomain.com/health/deep | jq .

# Run all backend tests (in Docker)
docker compose exec voiceai-api python -m pytest app/__tests__/ -q --tb=line

# Run LiveKit E2E tests
docker compose exec voiceai-api python -m pytest app/__tests__/test_livekit_e2e.py -v --tb=short

# Run dashboard tests
docker compose exec dashboard npx vitest run --reporter=verbose
```

---

## Post-Deployment Checklist

```bash
# ── Services Running ──
# [ ] docker compose ps — all 6 services healthy (livekit, api, worker, ollama, postgres, dashboard)

# ── API Health ──
# [ ] curl localhost:8000/health        → 200 OK
# [ ] curl localhost:8000/health/deep   → 200 + all dependencies green
# [ ] curl localhost:8000/providers     → 200 + provider list
# [ ] curl localhost:8000/metrics       → 200 + Prometheus metrics

# ── Voice Pipeline ──
# [ ] curl -X POST localhost:8000/voice/complete -d '{"messages":[{"role":"user","content":"Hello"}]}' → 200 + response text

# ── LiveKit ──
# [ ] curl localhost:7880/  → 200 + LiveKit status
# [ ] Token generation works: python -c "from app.livekit.room_manager import get_room_manager; t = get_room_manager().generate_token('test-room', 'test-user'); print(t)"

# ── Security ──
# [ ] ufw status → 8 allow rules, default deny incoming
# [ ] fail2ban-client status → sshd jail active
# [ ] Ports 22, 80, 443, 7880, 7881, 7882/udp only

# ── SSL ──
# [ ] curl -vI https://api.voiceai.yourdomain.com/ → 200 + valid SSL cert
# [ ] curl -vI https://dashboard.voiceai.yourdomain.com/ → 200 + valid SSL cert

# ── Monitoring ──
# [ ] Log rotation configured: /etc/logrotate.d/voiceai
# [ ] Daily DB backup cron job installed
# [ ] Prometheus scraping /metrics (if configured)
```

---

## Cost Breakdown

| Item | Cost | Notes |
|------|------|-------|
| Hetzner CX52 (8 vCPU, 32 GB) | ~€35/mo | Base production tier |
| Domain name | ~€10/yr | e.g., voiceai.yourdomain.com |
| Twilio phone number | ~$1.15/mo | Voice-enabled US number |
| Twilio usage | ~$0.014/min | Per-minute call costs |
| **Total baseline** | **~€40/mo + usage** | Production-ready |

**GPU Upgrade:** Add GEX44 (A100, €249/mo) for Whisper large-v3 + Kokoro high-quality TTS.

---

## Scaling Plan

### When to Scale

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU usage | > 80% sustained | Add more vCPU |
| RAM usage | > 85% | Upgrade to CX62 (16 GB) or CX72 (32 GB) |
| Concurrent calls | > 15 | Add voiceai-worker replicas |
| API latency p95 | > 3s | Switch to GPU for Whisper |
| Disk usage | > 80% | Clean old logs, expand volume |

### Scale Commands

```bash
# Horizontal: Add more workers
docker compose up -d --scale voiceai-worker=3

# Vertical: Edit .env for GPU, then --profile gpu
docker compose --profile gpu up -d

# Multi-node: Add a second server for Ollama + DB
# server 2: postgres + redis + ollama
# server 1: voiceai-api + voiceai-worker + livekit
```

### Performance Targets

| Config | Concurrent Calls | p50 Latency | p95 Latency |
|--------|-----------------|-------------|-------------|
| CX52 CPU-only (8 vCPU, 32 GB) | 10-15 | ~1.5s | ~3.5s |
| CX72 CPU-only (16 vCPU, 32 GB) | 15-25 | ~1.0s | ~2.5s |
| GEX44 GPU (8 vCPU, A100-80GB) | 20-40 | ~0.5s | ~1.2s |

---

## Recovery Procedures

### Service Restart

```bash
# Restart everything
docker compose down && docker compose up -d

# Restart single service (no downtime)
docker compose restart voiceai-api

# Rebuild + restart (after code changes)
docker compose up -d --build voiceai-api
```

### Database Recovery

```bash
# From backup
cat /backups/db_20260527.sql | docker exec -i voiceai-postgres psql -U voiceai voiceai

# Reset (lose all data)
docker compose down && docker volume rm voiceai-orchestrator_postgres_data
docker compose up -d postgres
```

### Full Server Recovery

```bash
# Provision a new Hetzner server (same spec)
hcloud server create --name voiceai-prod-v2 --type cx52 --image ubuntu-24.04

# Run the Quick-Start script above (git clone builds fresh)
# Then restore DB backup
# Then restore audio/cache if needed
```

---

## Quick Reference Card

```bash
#── SERVICE MANAGEMENT ──
docker compose up -d                     # Start all
docker compose down                      # Stop all
docker compose logs -f voiceai-api       # Follow API logs
docker compose exec voiceai-api bash     # Shell into API

#── API CALLS ──
curl localhost:8000/health               # Health check
curl localhost:8000/health/deep          # Deep health
curl localhost:8000/providers            # Provider list
curl localhost:8000/metrics              # Prometheus metrics

#── TESTS ──
docker compose exec voiceai-api python -m pytest app/__tests__/ -q --tb=line
docker compose exec voiceai-api python -m pytest app/__tests__/test_livekit_e2e.py -v

#── MAINTENANCE ──
docker system prune -f                   # Clean Docker cache
docker compose pull                      # Update images
docker compose up -d --build             # Rebuild services
```
