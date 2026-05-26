#!/usr/bin/env bash
# ============================================================================
# VoiceAI Orchestrator — Docker Stack Teardown
# ============================================================================
#
# Stops and cleans up all VoiceAI Docker services.
#
# Usage:
#   ./scripts/down.sh              # Stop all services (keep volumes)
#   ./scripts/down.sh --volumes    # Stop + remove volumes (destroys data)
#   ./scripts/down.sh --cleanup    # Stop + remove volumes + prune images
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
echo -e "${CYAN}║     VoiceAI Orchestrator — Teardown         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments
REMOVE_VOLUMES=false
CLEANUP=false

for arg in "$@"; do
    case "$arg" in
        --volumes) REMOVE_VOLUMES=true ;;
        --cleanup) REMOVE_VOLUMES=true; CLEANUP=true ;;
        --help)
            echo "Usage: ./scripts/down.sh [--volumes] [--cleanup]"
            echo ""
            echo "  --volumes   Also remove Postgres/Redis volumes (destroys all data)"
            echo "  --cleanup   Volumes + prune unused Docker images and cache"
            exit 0
            ;;
    esac
done

echo -e "${YELLOW}Stopping VoiceAI containers...${NC}"

if [ "$REMOVE_VOLUMES" = true ]; then
    echo -e "${RED}⚠ Removing volumes — all data will be lost!${NC}"
    sleep 2
    docker compose down --remove-orphans -v
    echo -e "${GREEN}✓ Containers stopped and volumes removed${NC}"
else
    docker compose down --remove-orphans
    echo -e "${GREEN}✓ Containers stopped (volumes preserved)${NC}"
fi

echo ""

if [ "$CLEANUP" = true ]; then
    echo -e "${YELLOW}Pruning unused Docker resources...${NC}"
    docker image prune -f
    docker builder prune -f
    echo -e "${GREEN}✓ Unused images and cache pruned${NC}"
fi

# Check for any lingering containers that might have been missed
LINGERING=$(docker ps --filter "name=voiceai" --filter "name=livekit" --format "{{.Names}}" 2>/dev/null || true)
if [ -n "$LINGERING" ]; then
    echo -e "${YELLOW}Force-removing lingering containers:${NC}"
    echo "$LINGERING" | while read -r container; do
        docker rm -f "$container" 2>/dev/null || true
        echo -e "  ${RED}✗${NC} Removed $container"
    done
fi

echo ""
echo -e "${GREEN}─── Summary ───${NC}"
echo -e "  Containers:  ${GREEN}stopped${NC}"
echo -e "  Volumes:     $([ "$REMOVE_VOLUMES" = true ] && echo -e "${RED}removed${NC}" || echo -e "${GREEN}preserved${NC}")"
echo -e "  Cleanup:     $([ "$CLEANUP" = true ] && echo -e "${GREEN}done${NC}" || echo -e "${YELLOW}skipped${NC}")"
echo ""

echo -e "${GREEN}✓ Teardown complete${NC}"
