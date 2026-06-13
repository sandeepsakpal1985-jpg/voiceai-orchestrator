#!/usr/bin/env bash
# ==============================================================================
# AI Sales Agent — Stop Services (Native Mode)
# ==============================================================================
# Gracefully stops all services in reverse order.
#
# Order:
#   1. Backend (systemd)
#   2. FreeSWITCH (systemd)
#   3. Ollama (systemd)
#   4. Redis (systemd)
#
# Usage:
#   sudo ./scripts/stop_services.sh              # Stop all services
#   sudo ./scripts/stop_services.sh --no-freeswitch  # Skip FreeSWITCH
#   sudo ./scripts/stop_services.sh --force      # Kill instead of graceful stop
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SKIP_FREESWITCH=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --no-freeswitch) SKIP_FREESWITCH=true ;;
    --force)         FORCE=true ;;
  esac
done

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
fail() { echo -e "${RED}  ❌ $*${NC}"; }

if [ "$(id -u)" -ne 0 ]; then
  fail "This script must be run as root (use sudo)"
fi

STOP_CMD="stop"
[ "$FORCE" = true ] && STOP_CMD="kill"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          AI Sales Agent — Stop Native Services               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Stopping services in reverse order: Backend → FreeSWITCH → Ollama → Redis"
echo ""

# ── Step 1: Backend ──────────────────────────────────────────────────────────
log "Service 1/3: Backend (FastAPI)"
if systemctl is-active --quiet ai-sales-agent 2>/dev/null; then
  systemctl ${STOP_CMD} ai-sales-agent
  ok "Backend service stopped"
else
  # Kill any lingering uvicorn processes
  PIDS=$(pgrep -f "uvicorn app.main:app" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    ok "Killed lingering backend processes: $PIDS"
  else
    warn "Backend not running"
  fi
fi

# ── Step 2: FreeSWITCH (optional) ────────────────────────────────────────────
if [ "$SKIP_FREESWITCH" = true ]; then
  log "Service 2/3: Skipping FreeSWITCH"
else
  log "Service 2/3: FreeSWITCH"
  if systemctl is-active --quiet freeswitch 2>/dev/null; then
    systemctl ${STOP_CMD} freeswitch
    ok "FreeSWITCH service stopped"
  elif command -v fs_cli &>/dev/null && fs_cli -x "status" 2>/dev/null | grep -q UP; then
    fs_cli -x "fsctl shutdown" 2>/dev/null || true
    ok "FreeSWITCH shut down via fs_cli"
  else
    warn "FreeSWITCH not running"
  fi
fi

# ── Step 3: Ollama ───────────────────────────────────────────────────────────
log "Service 3/3: Ollama"
if systemctl is-active --quiet ollama 2>/dev/null; then
  systemctl ${STOP_CMD} ollama
  ok "Ollama service stopped"
else
  PIDS=$(pgrep -f "ollama serve" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    ok "Killed lingering Ollama processes"
  else
    warn "Ollama not running"
  fi
fi

# ── Step 4: Redis ────────────────────────────────────────────────────────────
log "Service 4/4: Redis"
if systemctl is-active --quiet redis-server 2>/dev/null; then
  systemctl ${STOP_CMD} redis-server
  ok "Redis service stopped"
elif redis-cli ping 2>/dev/null | grep -q PONG; then
  redis-cli shutdown 2>/dev/null || true
  ok "Redis shut down via CLI"
else
  warn "Redis not running"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Verify all stopped
# ══════════════════════════════════════════════════════════════════════════════
echo ""
log "Verifying all services stopped..."
ALL_STOPPED=true

for svc in ai-sales-agent freeswitch ollama redis-server; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    warn "  $svc is still running"
    ALL_STOPPED=false
  fi
done

# Check for lingering processes
for proc in "uvicorn app.main:app" "freeswitch" "ollama serve" "redis-server"; do
  if pgrep -f "$proc" > /dev/null 2>&1; then
    warn "  Process still running: $proc"
    ALL_STOPPED=false
  fi
done

if [ "$ALL_STOPPED" = true ]; then
  echo -e "${GREEN}  ✅ All services stopped successfully${NC}"
else
  echo -e "${YELLOW}  ⚠️  Some services may still be running. Use --force to kill.${NC}"
fi

echo ""
echo "  To restart: sudo ./scripts/start_services.sh"
echo ""
