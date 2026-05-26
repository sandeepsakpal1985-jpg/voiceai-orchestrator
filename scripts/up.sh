#!/usr/bin/env bash
# ============================================================================
# VoiceAI Orchestrator — One-Command Docker Start
# ============================================================================
#
# Starts the full VoiceAI stack: Postgres, Redis, Ollama, LiveKit, API, Worker
#
# Usage:
#   ./scripts/up.sh              # Start all services
#   ./scripts/up.sh --gpu        # Start with GPU acceleration
#   ./scripts/up.sh --minimal    # Start only core services (postgres + ollama)
#   ./scripts/up.sh --logs       # Start and follow logs
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     VoiceAI Orchestrator — Docker Stack     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments
GPU=false
MINIMAL=false
FOLLOW_LOGS=false

for arg in "$@"; do
    case "$arg" in
        --gpu) GPU=true ;;
        --minimal) MINIMAL=true ;;
        --logs) FOLLOW_LOGS=true ;;
        --help)
            echo "Usage: ./scripts/up.sh [--gpu] [--minimal] [--logs]"
            echo ""
            echo "  --gpu       Start with GPU-accelerated services"
            echo "  --minimal   Start only core services (postgres + ollama)"
            echo "  --logs      Follow logs after starting"
            exit 0
            ;;
    esac
done

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ No .env file found. Creating from defaults...${NC}"
    cat > .env << 'EOF'
# VoiceAI Orchestrator — Environment Configuration
# Copy this to .env and customize for your deployment.

# --- Providers ---
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro

# --- LiveKit ---
LIVEKIT_ENABLED=true
LIVEKIT_URL=ws://livekit-server:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# --- Database ---
DATABASE_URL=postgresql://voiceai:voiceai@postgres:5432/voiceai
REDIS_URL=redis://redis:6379

# --- Ollama ---
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5:7b

# --- Auth ---
AUTH_SECRET=dev-secret-change-in-production
EOF
    echo -e "${GREEN}✓ .env file created${NC}"
fi

# Stop any existing containers from this project
echo -e "${YELLOW}Stopping any existing VoiceAI containers...${NC}"
docker compose down --remove-orphans 2>/dev/null || true

# Start services
if [ "$MINIMAL" = true ]; then
    echo -e "${CYAN}Starting minimal stack (postgres + ollama)...${NC}"
    docker compose up -d postgres ollama
elif [ "$GPU" = true ]; then
    echo -e "${CYAN}Starting full GPU-accelerated stack...${NC}"
    docker compose --profile gpu up -d
else
    echo -e "${CYAN}Starting full CPU stack...${NC}"
    docker compose up -d
fi

echo ""
echo -e "${GREEN}✓ Stack started!${NC}"
echo ""

# Show container status
docker compose ps

echo ""
echo -e "${GREEN}─── Service URLs ───${NC}"
echo -e "  API:        ${CYAN}http://localhost:8000${NC}"
echo -e "  Dashboard:  ${CYAN}http://localhost:3000${NC}"
echo -e "  LiveKit:    ${CYAN}ws://localhost:7880${NC}"
echo -e "  Ollama:     ${CYAN}http://localhost:11434${NC}"
echo -e "  Swagger:    ${CYAN}http://localhost:8000/docs${NC}"
echo ""

# Check if Ollama has the model, pull if not
if docker compose exec ollama ollama list 2>/dev/null | grep -q "qwen2.5"; then
    echo -e "${GREEN}✓ Ollama model qwen2.5:7b already pulled${NC}"
else
    echo -e "${YELLOW}Pulling Ollama model (qwen2.5:7b)...${NC}"
    docker compose exec -d ollama ollama pull qwen2.5:7b
fi

echo ""

if [ "$FOLLOW_LOGS" = true ]; then
    echo -e "${CYAN}Following logs (Ctrl+C to stop)...${NC}"
    docker compose logs -f
fi
