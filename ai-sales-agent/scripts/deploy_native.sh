#!/usr/bin/env bash
# ==============================================================================
# AI Sales Agent — Native Deployment Script
# ==============================================================================
# Deploys all configuration files, sets up environment, and validates the
# native (non-Docker) deployment of the AI Sales Agent stack.
#
# Usage:
#   sudo ./scripts/deploy_native.sh                     # Full deployment
#   sudo ./scripts/deploy_native.sh --skip-freeswitch   # Skip FreeSWITCH config
#   sudo ./scripts/deploy_native.sh --dry-run           # Show what would be done
#
# Environment variables (set in .env or export before running):
#   DEPLOY_DIR          - Deployment directory (default: /opt/ai-sales-agent)
#   FREESWITCH_CONF_DIR - FreeSWITCH config directory
#   BACKEND_PORT        - Backend port (default: 8000)
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/ai-sales-agent}"
FREESWITCH_CONF_DIR="${FREESWITCH_CONF_DIR:-/usr/local/freeswitch/conf}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
LOG_FILE="/tmp/ai-sales-agent-deploy-$(date +%Y%m%d-%H%M%S).log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

SKIP_FREESWITCH=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-freeswitch) SKIP_FREESWITCH=true ;;
    --dry-run)         DRY_RUN=true ;;
    *)                 echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

log()     { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"; }
ok()      { echo -e "${GREEN}  ✅ $*${NC}" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}  ⚠️  $*${NC}" | tee -a "$LOG_FILE"; }
fail()    { echo -e "${RED}  ❌ $*${NC}" | tee -a "$LOG_FILE"; exit 1; }
cmd()     {
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}  [DRY-RUN] would run:${NC} $*"
  else
    "$@" 2>&1 | tee -a "$LOG_FILE"
    return "${PIPESTATUS[0]}"
  fi
}

if [ "$(id -u)" -ne 0 ] && [ "$DRY_RUN" = false ]; then
  fail "This script must be run as root (use sudo)"
fi

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         AI Sales Agent — Native Deployment Script            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Project directory:  ${PROJECT_DIR}"
echo "Deploy directory:   ${DEPLOY_DIR}"
echo "Log file:           ${LOG_FILE}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Create deployment directory
# ══════════════════════════════════════════════════════════════════════════════
log "Step 1/7: Creating deployment directory"
cmd mkdir -p "${DEPLOY_DIR}"
cmd mkdir -p "${DEPLOY_DIR}/backend"
cmd mkdir -p "${DEPLOY_DIR}/data/audio/cache"
cmd mkdir -p "${DEPLOY_DIR}/data/chroma"
cmd mkdir -p "${DEPLOY_DIR}/tmp_fs_audio"
cmd mkdir -p "${DEPLOY_DIR}/logs"
ok "Deployment directories created"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Copy backend code + telephony module
# ══════════════════════════════════════════════════════════════════════════════
log "Step 2/7: Copying backend code and telephony module"
cmd cp -r "${PROJECT_DIR}/backend/app" "${DEPLOY_DIR}/backend/"
cmd cp "${PROJECT_DIR}/backend/requirements.txt" "${DEPLOY_DIR}/backend/"
cmd cp -r "${PROJECT_DIR}/telephony" "${DEPLOY_DIR}/"
cmd cp -r "${PROJECT_DIR}/prompts" "${DEPLOY_DIR}/"
ok "Backend code and telephony module deployed"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Set up environment
# ══════════════════════════════════════════════════════════════════════════════
log "Step 3/7: Configuring environment"

if [ -f "${PROJECT_DIR}/.env" ]; then
  cmd cp "${PROJECT_DIR}/.env" "${DEPLOY_DIR}/.env"
  ok ".env file copied"
else
  warn "No .env file found. Create one from .env.example"
fi

# IMPORTANT: systemd EnvironmentFile requires KEY=value WITHOUT export prefix.
# The activate_env.sh (created later) uses 'export' for shell sourcing.
cmd tee "${DEPLOY_DIR}/.env.native" > /dev/null <<'ENVFILE'
# AI Sales Agent — Native Deployment Configuration
# This file is loaded by systemd (EnvironmentFile=) so no 'export' prefix.
# Service hosts — native uses localhost; Docker uses container names
DEPLOYMENT_MODE=native
OLLAMA_HOST=127.0.0.1
OLLAMA_BASE_URL=http://127.0.0.1:11434
REDIS_HOST=127.0.0.1
REDIS_URL=redis://127.0.0.1:6379
FREESWITCH_HOST=127.0.0.1
FREESWITCH_ESL_HOST=127.0.0.1
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=ClueCon
FREESWITCH_BRIDGE_ENABLED=true
FREESWITCH_AUDIO_DIR=/opt/ai-sales-agent/tmp_fs_audio
HOST=0.0.0.0
PORT=8000
APP_NAME=AI Sales Agent (Native)
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro
ENVFILE
ok "Native environment configuration created (systemd-compatible)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Configure FreeSWITCH (if installed)
# ══════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_FREESWITCH" = false ]; then
  log "Step 4/7: Configuring FreeSWITCH"

  if [ -d "${FREESWITCH_CONF_DIR}" ]; then
    if [ "$DRY_RUN" = false ]; then
      BACKUP_DIR="/tmp/freeswitch-conf-backup-$(date +%Y%m%d-%H%M%S)"
      cmd cp -r "${FREESWITCH_CONF_DIR}" "${BACKUP_DIR}"
      warn "FreeSWITCH config backed up to ${BACKUP_DIR}"
    fi

    FS_SRC="${PROJECT_DIR}/telephony/configs/freeswitch"
    if [ -d "${FS_SRC}" ]; then
      cmd cp "${FS_SRC}/dialplan/default.xml"  "${FREESWITCH_CONF_DIR}/dialplan/default.xml"
      cmd cp "${FS_SRC}/event_socket.conf.xml"  "${FREESWITCH_CONF_DIR}/autoload_configs/event_socket.conf.xml"
      cmd cp "${FS_SRC}/sip_profiles/internal.xml" "${FREESWITCH_CONF_DIR}/sip_profiles/internal.xml"
      cmd mkdir -p "${FREESWITCH_CONF_DIR}/autoload_configs"
      cmd cp "${FS_SRC}/ai_bridge.xml" "${FREESWITCH_CONF_DIR}/autoload_configs/ai_bridge.xml" 2>/dev/null || true

      DIR_SRC="${FS_SRC}/directory/default"
      if [ -d "${DIR_SRC}" ]; then
        cmd mkdir -p "${FREESWITCH_CONF_DIR}/directory/default"
        for ext_xml in "${DIR_SRC}"/*.xml; do
          [ -f "$ext_xml" ] && cmd cp "$ext_xml" "${FREESWITCH_CONF_DIR}/directory/default/"
        done
      fi
      ok "FreeSWITCH AI configs deployed"
    else
      warn "FreeSWITCH config source not found: ${FS_SRC}"
    fi
  else
    warn "FreeSWITCH config directory not found: ${FREESWITCH_CONF_DIR}"
    warn "  Install FreeSWITCH first: ./scripts/install_dependencies.sh"
  fi
else
  log "Step 4/7: Skipping FreeSWITCH configuration (--skip-freeswitch)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Set up systemd services
# ══════════════════════════════════════════════════════════════════════════════
log "Step 5/7: Setting up systemd services"

cmd tee /etc/systemd/system/ai-sales-agent.service > /dev/null <<SERVICE
[Unit]
Description=AI Sales Agent Backend
After=network.target redis-server.service ollama.service
Wants=redis-server.service ollama.service

[Service]
Type=simple
User=ai-agent
Group=ai-agent
WorkingDirectory=${DEPLOY_DIR}/backend
EnvironmentFile=${DEPLOY_DIR}/.env.native
ExecStart=${DEPLOY_DIR}/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} --log-level info
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

cmd systemctl daemon-reload
cmd systemctl enable ai-sales-agent
ok "Backend systemd service created and enabled (user: ai-agent)"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Create launcher/helper scripts
# ══════════════════════════════════════════════════════════════════════════════
log "Step 6/7: Creating helper scripts"

# activate_env.sh uses 'export' for shell sourcing (different from systemd's
# EnvironmentFile format — this is intentional)
cmd tee "${DEPLOY_DIR}/activate_env.sh" > /dev/null <<'ENVSCRIPT'
#!/usr/bin/env bash
# Source this file to activate the native deployment environment:
#   source /opt/ai-sales-agent/activate_env.sh
export DEPLOYMENT_MODE="native"
export OLLAMA_BASE_URL="http://127.0.0.1:11434"
export REDIS_URL="redis://127.0.0.1:6379"
export FREESWITCH_ESL_HOST="127.0.0.1"
export FREESWITCH_ESL_PORT="8021"
export FREESWITCH_ESL_PASSWORD="ClueCon"
export FREESWITCH_BRIDGE_ENABLED="true"
export HOST="0.0.0.0"
export PORT="8000"
export APP_NAME="AI Sales Agent (Native)"
echo "✅ AI Sales Agent native environment activated"
ENVSCRIPT
cmd chmod +x "${DEPLOY_DIR}/activate_env.sh"
ok "Helper scripts created"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7: Validate deployment
# ══════════════════════════════════════════════════════════════════════════════
log "Step 7/7: Validating deployment"

VALIDATION_FAILED=false

check_file() {
  if [ -f "$1" ]; then ok "  Found: $1"; else warn "  Missing: $1"; VALIDATION_FAILED=true; fi
}
check_dir() {
  if [ -d "$1" ]; then ok "  Found directory: $1"; else warn "  Missing directory: $1"; VALIDATION_FAILED=true; fi
}

check_file "${DEPLOY_DIR}/backend/app/main.py"
check_file "${DEPLOY_DIR}/backend/requirements.txt"
check_dir  "${DEPLOY_DIR}/backend/app"
check_dir  "${DEPLOY_DIR}/telephony"
check_dir  "${DEPLOY_DIR}/data/audio/cache"
check_dir  "${DEPLOY_DIR}/tmp_fs_audio"
check_file "${DEPLOY_DIR}/.env.native"  check_file "${DEPLOY_DIR}/activate_env.sh"

# Fix ownership so the ai-agent user can read/write all deployed files
if [ "$DRY_RUN" = false ]; then
  if id -u ai-agent &>/dev/null; then
    cmd chown -R ai-agent:ai-agent "${DEPLOY_DIR}"
    ok "Deployment directory owned by ai-agent"
  fi
fi

if [ "$VALIDATION_FAILED" = true ]; then
  warn "Some files are missing. Check the log for details."
else
  ok "Deployment validation passed!"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Deployment Complete!                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Deployed to: ${DEPLOY_DIR}"
echo ""
echo "  To start services:"
echo "    sudo ./scripts/start_services.sh"
echo ""
echo "  To verify:"
echo "    ./scripts/check_health.sh"
echo ""
echo "  Log file: ${LOG_FILE}"
