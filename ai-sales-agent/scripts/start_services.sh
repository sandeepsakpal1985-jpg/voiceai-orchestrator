#!/usr/bin/env bash
# ==============================================================================
# AI Sales Agent — Start Services (Native Mode)
# ==============================================================================
# Starts all services in the correct order with health checks between each.
#
# Order:
#   1. Redis (systemd)
#   2. Ollama (systemd)
#   3. FreeSWITCH (systemd)
#   4. Backend (systemd)
#
# Usage:
#   sudo ./scripts/start_services.sh              # Start all services
#   sudo ./scripts/start_services.sh --no-freeswitch  # Skip FreeSWITCH
#   sudo ./scripts/start_services.sh --status     # Show current status only
#   sudo ./scripts/start_services.sh --restart    # Restart all services
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ai-sales-agent}"
POLL_MAX_RETRIES="${POLL_MAX_RETRIES:-15}"
POLL_INTERVAL="${POLL_INTERVAL:-2}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

SKIP_FREESWITCH=false
SHOW_STATUS=false
DO_RESTART=false

for arg in "$@"; do
  case "$arg" in
    --no-freeswitch) SKIP_FREESWITCH=true ;;
    --status)        SHOW_STATUS=true ;;
    --restart)       DO_RESTART=true ;;
  esac
done

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
fail() { echo -e "${RED}  ❌ $*${NC}"; }

# Poll a service endpoint until it responds or timeout
poll_ready() {
  local desc="$1" cmd="$2"
  local i=0
  while [ $i -lt "$POLL_MAX_RETRIES" ]; do
    if eval "$cmd" > /dev/null 2>&1; then
      ok "${desc} is ready"
      return 0
    fi
    i=$((i + 1))
    sleep "$POLL_INTERVAL"
  done
  warn "${desc} not ready after $((POLL_MAX_RETRIES * POLL_INTERVAL))s"
  return 1
}

# ── Status Mode ──────────────────────────────────────────────────────────────
if [ "$SHOW_STATUS" = true ]; then
  echo ""
  echo -e "${CYAN}Service Status:${NC}"
  echo ""
  for svc in redis-server ollama freeswitch ai-sales-agent; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      ok "$svc is running"
    else
      fail "$svc is not running"
    fi
  done
  exit 0
fi

# ── Preflight ────────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  fail "This script must be run as root (use sudo)"
fi

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         AI Sales Agent — Start Native Services               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Starting services in order: Redis → Ollama → FreeSWITCH → Backend"
echo ""

# ── Step 1: Redis ────────────────────────────────────────────────────────────
log "Service 1/4: Redis"
if redis-cli ping 2>/dev/null | grep -q PONG; then
  ok "Redis already running"
else
  if systemctl start redis-server 2>/dev/null; then
    ok "Redis started via systemd"
  elif command -v redis-server &>/dev/null; then
    redis-server --daemonize yes --port 6379 2>/dev/null || true
    warn "Redis started directly (no systemd service)"
  else
    fail "Redis not installed. Run install_dependencies.sh first."
  fi
  poll_ready "Redis" "redis-cli ping 2>/dev/null | grep -q PONG" || fail "Redis failed to start"
fi

# ── Step 2: Ollama ───────────────────────────────────────────────────────────
log "Service 2/4: Ollama"
if curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
  ok "Ollama already running"
else
  if systemctl start ollama 2>/dev/null; then
    ok "Ollama started via systemd"
  elif command -v ollama &>/dev/null; then
    nohup ollama serve > /dev/null 2>&1 &
    warn "Ollama started directly (no systemd service)"
  else
    fail "Ollama not installed. Run install_dependencies.sh first."
  fi
  poll_ready "Ollama" "curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1" || warn "Ollama may not be ready yet"
fi

# ── Step 3: FreeSWITCH (optional) ────────────────────────────────────────────
if [ "$SKIP_FREESWITCH" = true ]; then
  log "Service 3/4: Skipping FreeSWITCH (--no-freeswitch)"
else
  log "Service 3/4: FreeSWITCH"
  if command -v fs_cli &>/dev/null && fs_cli -x "status" 2>/dev/null | grep -q UP; then
    ok "FreeSWITCH already running"
  else
    if systemctl is-enabled freeswitch 2>/dev/null; then
      systemctl start freeswitch || warn "systemctl start freeswitch failed"
      ok "FreeSWITCH started via systemd"
    elif command -v freeswitch &>/dev/null; then
      freeswitch -nc 2>/dev/null || warn "freeswitch -nc failed"
      warn "FreeSWITCH started directly (no systemd service, may take 10-30s)"
    else
      warn "FreeSWITCH not installed. Skipping."
      SKIP_FREESWITCH=true
    fi
    if [ "$SKIP_FREESWITCH" = false ]; then
      poll_ready "FreeSWITCH ESL" "command -v fs_cli > /dev/null && fs_cli -x 'status' 2>/dev/null | grep -q UP" || warn "FreeSWITCH may not be ready yet"
    fi
  fi
fi

# ── Step 4: Backend (FastAPI) ────────────────────────────────────────────────
log "Service 4/4: Backend (FastAPI)"

# Source native env vars if available (for shell direct start fallback)
ENV_FILE="${DEPLOY_DIR}/.env.native"
if [ -f "$ENV_FILE" ]; then
  # Import without export prefix (systemd format) — works with shell sourcing
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

# Find uvicorn
VENV_DIR="${PROJECT_DIR}/backend/venv"
if [ ! -d "$VENV_DIR" ]; then
  VENV_DIR="${DEPLOY_DIR}/backend/venv"
fi

if [ -f "${VENV_DIR}/bin/uvicorn" ]; then
  UVICORN="${VENV_DIR}/bin/uvicorn"
elif command -v uvicorn &>/dev/null; then
  UVICORN="$(command -v uvicorn)"
else
  fail "uvicorn not found. Run install_dependencies.sh first."
fi

if systemctl is-active --quiet ai-sales-agent 2>/dev/null; then
  ok "Backend already running"
else
  if systemctl start ai-sales-agent 2>/dev/null; then
    ok "Backend started via systemd"
  else
    warn "Backend systemd service not found. Starting directly..."
    cd "${DEPLOY_DIR}/backend" 2>/dev/null || cd "${PROJECT_DIR}/backend"
    nohup "$UVICORN" app.main:app \
      --host "${HOST:-0.0.0.0}" \
      --port "${PORT:-8000}" \
      --log-level info \
      > "${DEPLOY_DIR}/logs/backend.log" 2>&1 &
  fi
  poll_ready "Backend (FastAPI)" "curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1" || warn "Backend may not be ready yet. Check: journalctl -u ai-sales-agent -f"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Services Started!                                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Services:"
echo "    ✅ Redis:      127.0.0.1:6379"
echo "    ✅ Ollama:     127.0.0.1:11434"
if [ "$SKIP_FREESWITCH" = false ]; then echo "    ✅ FreeSWITCH: 127.0.0.1:8021 (ESL) / 5060 (SIP)"; fi
echo "    ✅ Backend:    0.0.0.0:${PORT:-8000}"
echo ""
echo "  Verify:  ./scripts/check_health.sh"
echo "  Stop:    sudo ./scripts/stop_services.sh"
echo "  Logs:    journalctl -u ai-sales-agent -f"
echo ""
