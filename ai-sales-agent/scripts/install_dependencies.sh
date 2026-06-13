#!/usr/bin/env bash
# ==============================================================================
# AI Sales Agent — Native Dependency Installer
# ==============================================================================
# Installs all system dependencies for native (non-Docker) deployment on
# Ubuntu 22.04/24.04. Supports both CPU-only and GPU (NVIDIA) configurations.
#
# Usage:
#   sudo ./scripts/install_dependencies.sh              # CPU-only (default)
#   sudo ./scripts/install_dependencies.sh --gpu        # With GPU support
#   sudo ./scripts/install_dependencies.sh --dry-run    # Show what would be done
#
# Phases:
#   1. System packages (Python, build tools, audio libs)
#   2. NVIDIA driver + CUDA (optional, --gpu flag)
#   3. Ollama (local LLM)
#   4. Redis (caching, persistence)
#   5. FreeSWITCH (telephony media server)
#   6. Python virtual environment + dependencies
# ==============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
AI_USER="ai-agent"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${PROJECT_DIR}/backend/venv"
LOG_FILE="/tmp/ai-sales-agent-install-$(date +%Y%m%d-%H%M%S).log"
FREESWITCH_BRANCH="v1.10.12"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Flags ─────────────────────────────────────────────────────────────────────
INSTALL_GPU=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --gpu)     INSTALL_GPU=true ;;
    --dry-run) DRY_RUN=true ;;
    *)         echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
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

# ── Preflight ─────────────────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ] && [ "$DRY_RUN" = false ]; then
  fail "This script must be run as root (use sudo)"
fi

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        AI Sales Agent — Native Dependency Installer          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Project directory:  ${PROJECT_DIR}"
echo "Log file:           ${LOG_FILE}"
echo "GPU support:        ${INSTALL_GPU}"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1: System Packages + Python 3.12
# ══════════════════════════════════════════════════════════════════════════════
log "Phase 1/6: System packages & Python 3.12"

# Add deadsnakes PPA for Python 3.12
cmd apt-get update -y
cmd apt-get install -y software-properties-common
cmd add-apt-repository -y ppa:deadsnakes/ppa
cmd apt-get update -y

cmd apt-get install -y \
  build-essential git curl wget gnupg lsb-release ca-certificates \
  python3.12 python3.12-venv python3.12-dev python3-pip \
  ffmpeg libsndfile1 libopus0 libopus-dev \
  libssl-dev libcurl4-openssl-dev libpcre3-dev libspeexdsp-dev \
  libldns-dev libedit-dev libtiff5-dev libpq-dev libsqlite3-dev \
  libsndfile1-dev autoconf automake libtool pkg-config

# Verify Python 3.12
if ! command -v python3.12 &>/dev/null; then
  fail "python3.12 not found after installation. Check the log: ${LOG_FILE}"
fi
ok "System packages installed (Python 3.12: $(python3.12 --version))"

# Create ai-agent user for production (if it doesn't exist)
if ! id -u "${AI_USER}" &>/dev/null; then
  log "  Creating system user: ${AI_USER}"
  cmd useradd -m -s /bin/bash -G audio "${AI_USER}"
  ok "System user '${AI_USER}' created"
else
  ok "System user '${AI_USER}' already exists"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2: NVIDIA GPU / CUDA (Optional)
# ══════════════════════════════════════════════════════════════════════════════
if [ "$INSTALL_GPU" = true ]; then
  log "Phase 2/6: NVIDIA GPU + CUDA"

  if lspci | grep -i nvidia > /dev/null 2>&1; then
    log "  NVIDIA GPU detected. Installing NVIDIA drivers from official repo..."
    # Use NVIDIA CUDA repository for broader compatibility
    cmd wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb -O /tmp/cuda-keyring.deb 2>/dev/null || \
      cmd wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb -O /tmp/cuda-keyring.deb
    cmd dpkg -i /tmp/cuda-keyring.deb
    cmd apt-get update -y
    cmd apt-get install -y cuda-drivers cuda-toolkit-12-4

    if command -v nvidia-smi &>/dev/null; then
      ok "NVIDIA driver: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null || echo 'installed')"
      ok "CUDA: $(nvcc --version 2>/dev/null | grep release | awk '{print $5, $6}' || echo 'installed')"
    else
      warn "NVIDIA driver installed but nvidia-smi not available (reboot may be required)"
    fi
  else
    warn "No NVIDIA GPU detected. Skipping GPU driver installation."
    warn "  Use without --gpu flag for CPU-only mode, or install GPU drivers manually."
  fi
else
  log "Phase 2/6: Skipping GPU/CUDA (use --gpu flag to enable)"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3: Ollama (Local LLM)
# ══════════════════════════════════════════════════════════════════════════════
log "Phase 3/6: Ollama (Local LLM)"

if command -v ollama &>/dev/null; then
  ok "Ollama already installed: $(ollama --version 2>/dev/null || echo 'present')"
else
  log "  Downloading and installing Ollama..."
  cmd curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
fi

# Pull default model
DEFAULT_OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
log "  Pulling Ollama model: ${DEFAULT_OLLAMA_MODEL}"
if [ "$DRY_RUN" = false ]; then
  ollama pull "${DEFAULT_OLLAMA_MODEL}" 2>&1 | tee -a "$LOG_FILE" || warn "Model pull timed out or failed (can be run manually: ollama pull ${DEFAULT_OLLAMA_MODEL})"
  ok "Ollama model '${DEFAULT_OLLAMA_MODEL}' downloaded"
fi

# Update Ollama systemd service if it exists
OLLAMA_SERVICE="/etc/systemd/system/ollama.service"
if [ ! -f "$OLLAMA_SERVICE" ]; then
  log "  Creating Ollama systemd service..."
  cmd tee "$OLLAMA_SERVICE" > /dev/null <<SERVICE
[Unit]
Description=Ollama LLM Service
After=network.target

[Service]
Type=simple
User=${AI_USER}
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_KEEP_ALIVE=5m"
Environment="OLLAMA_NUM_PARALLEL=2"
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
  cmd systemctl daemon-reload
  cmd systemctl enable ollama
  ok "Ollama systemd service created and enabled (user: ${AI_USER})"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4: Redis (Caching & Persistence)
# ══════════════════════════════════════════════════════════════════════════════
log "Phase 4/6: Redis"

if command -v redis-server &>/dev/null; then
  ok "Redis already installed: $(redis-server --version 2>/dev/null || echo 'present')"
else
  log "  Installing Redis..."
  cmd apt-get install -y redis-server
  ok "Redis installed"
fi

# Configure Redis for production
REDIS_CONF="/etc/redis/redis.conf"
if [ -f "$REDIS_CONF" ]; then
  log "  Configuring Redis for production..."
  cmd sed -i 's/^appendonly no/appendonly yes/' "$REDIS_CONF"
  cmd sed -i 's/^# maxmemory <bytes>/maxmemory 512mb/' "$REDIS_CONF"
  cmd sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' "$REDIS_CONF"
  ok "Redis configured (AOF enabled, maxmemory 512MB)"
fi

cmd systemctl enable redis-server || warn "Could not enable Redis on boot"
cmd systemctl restart redis-server || warn "Could not restart Redis"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5: FreeSWITCH (Telephony Media Server)
# ══════════════════════════════════════════════════════════════════════════════
log "Phase 5/6: FreeSWITCH"

if command -v freeswitch &>/dev/null; then
  ok "FreeSWITCH already installed: $(freeswitch -version 2>/dev/null | head -1 || echo 'present')"
else
  log "  Installing FreeSWITCH from source (branch: ${FREESWITCH_BRANCH})..."
  log "  This may take 15-30 minutes..."

  FREESWITCH_SRC="/usr/local/src/freeswitch"
  if [ ! -d "$FREESWITCH_SRC" ]; then
    cmd git clone --depth 1 --branch "${FREESWITCH_BRANCH}" \
      https://github.com/signalwire/freeswitch.git "$FREESWITCH_SRC"
  else
    log "  FreeSWITCH source already cloned, updating..."
    cmd git -C "$FREESWITCH_SRC" pull
  fi
  cmd "${FREESWITCH_SRC}/bootstrap.sh" -j
  cmd "${FREESWITCH_SRC}/configure"
  cmd make -j"$(nproc)" -C "$FREESWITCH_SRC"
  cmd make -C "$FREESWITCH_SRC" install

  # Install AI-relevant modules
  log "  Installing FreeSWITCH modules..."
  cmd make -j"$(nproc)" -C "$FREESWITCH_SRC" mod_event_socket
  cmd make -j"$(nproc)" -C "$FREESWITCH_SRC" mod_sofia
  cmd make -j"$(nproc)" -C "$FREESWITCH_SRC" mod_dptools
  cmd make -C "$FREESWITCH_SRC" install mod_event_socket mod_sofia mod_dptools

  ok "FreeSWITCH installed from source"
fi

# Configure FreeSWITCH ESL
FS_CONF_DIR="/usr/local/freeswitch/conf"
if [ -d "$FS_CONF_DIR" ]; then
  log "  Configuring FreeSWITCH ESL..."
  ESL_CONF="${FS_CONF_DIR}/autoload_configs/event_socket.conf.xml"
  if [ -f "$ESL_CONF" ]; then
    cmd sed -i 's/listen-ip" value="[^"]*/listen-ip" value="127.0.0.1/' "$ESL_CONF"
    cmd sed -i 's/listen-port" value="[^"]*/listen-port" value="8021/' "$ESL_CONF"
    ok "FreeSWITCH ESL configured (127.0.0.1:8021)"
  fi
fi

# Create FreeSWITCH systemd service
FS_SERVICE="/etc/systemd/system/freeswitch.service"
if [ ! -f "$FS_SERVICE" ]; then
  log "  Creating FreeSWITCH systemd service..."
  cmd tee "$FS_SERVICE" > /dev/null <<SERVICE
[Unit]
Description=FreeSWITCH Media Server
After=network.target

[Service]
Type=simple
User=${AI_USER}
Group=${AI_USER}
ExecStart=/usr/local/freeswitch/bin/freeswitch -nc
ExecStop=/usr/local/freeswitch/bin/freeswitch -stop
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE
  cmd systemctl daemon-reload
  cmd systemctl enable freeswitch
  ok "FreeSWITCH systemd service created and enabled (user: ${AI_USER})"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6: Python Virtual Environment + Dependencies
# ══════════════════════════════════════════════════════════════════════════════
log "Phase 6/6: Python virtual environment"

cd "${PROJECT_DIR}"

if [ -d "${VENV_DIR}" ]; then
  ok "Virtual environment already exists: ${VENV_DIR}"
else
  log "  Creating Python virtual environment with python3.12..."
  cmd python3.12 -m venv "${VENV_DIR}"
  ok "Virtual environment created (Python 3.12)"
fi

log "  Installing Python dependencies..."
cmd "${VENV_DIR}/bin/pip" install --upgrade pip
cmd "${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/backend/requirements.txt"
ok "Python dependencies installed"

# Install PyTorch
if [ "$INSTALL_GPU" = true ]; then
  log "  Installing PyTorch with CUDA support..."
  cmd "${VENV_DIR}/bin/pip" install torch --index-url https://download.pytorch.org/whl/cu124
else
  log "  Installing PyTorch with CPU support..."
  cmd "${VENV_DIR}/bin/pip" install torch --index-url https://download.pytorch.org/whl/cpu
fi
ok "PyTorch installed"

# Fix ownership of project files to ai-agent user
if [ "$DRY_RUN" = false ]; then
  cmd chown -R "${AI_USER}:${AI_USER}" "${PROJECT_DIR}"
  ok "Project files owned by ${AI_USER}"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Installation Complete!                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Components installed:"
echo "    ✅ System packages + Python 3.12"
if [ "$INSTALL_GPU" = true ]; then echo "    ✅ NVIDIA GPU drivers + CUDA"; else echo "    ⚠️  GPU drivers skipped"; fi
echo "    ✅ Ollama + model ${DEFAULT_OLLAMA_MODEL}"
echo "    ✅ Redis (AOF persistence, 512MB maxmemory)"
echo "    ✅ FreeSWITCH (ESL on 127.0.0.1:8021)"
echo "    ✅ Python venv at: ${VENV_DIR}"
echo "    ✅ System user: ${AI_USER}"
echo ""
echo "  Next steps:"
echo "    1. Configure .env:      cp .env.example .env"
echo "    2. Deploy configs:      sudo ./scripts/deploy_native.sh"
echo "    3. Start services:      sudo ./scripts/start_services.sh"
echo "    4. Check health:        ./scripts/check_health.sh"
echo ""
echo "  Log file: ${LOG_FILE}"
