#!/usr/bin/env bash
# WSL Full Stack Startup Script
# Usage: bash scripts/wsl_start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "  WSL Full Stack Startup"
echo "  Project: $PROJECT_DIR"
echo "=========================================="

cd "$PROJECT_DIR"

# ── 1. Redis (skip if already running) ──
echo ""
echo "[1/4] Starting Redis..."
if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "  ✅ Redis already running"
else
  redis-server --daemonize yes \
    --appendonly yes \
    --maxmemory 512mb \
    --maxmemory-policy allkeys-lru 2>/dev/null && echo "  ✅ Redis started" || echo "  ⚠️ Redis failed to start"
fi

# ── 2. Ollama ──
echo ""
echo "[2/4] Starting Ollama..."
if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "  ✅ Ollama already running"
else
  nohup ollama serve > /tmp/ollama.log 2>&1 &
  sleep 3
  if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "  ✅ Ollama started"
  else
    echo "  ❌ Ollama failed to start"
  fi
fi

# ── 3. FreeSWITCH (Docker) ──
echo ""
echo "[3/4] Starting FreeSWITCH..."
if docker ps -q --filter name=ai-freeswitch 2>/dev/null | grep -q .; then
  echo "  ✅ FreeSWITCH already running"
else
  docker rm -f ai-freeswitch 2>/dev/null || true
  docker run --name ai-freeswitch -d \
    --cap-add NET_ADMIN --cap-add SYS_ADMIN --cap-add SYS_PTRACE \
    -p 5060:5060/udp -p 5060:5060/tcp \
    -p 8021:8021 -p 8081:8081 \
    safarov/freeswitch:latest -nonat 2>/dev/null && echo "  ✅ FreeSWITCH started" || echo "  ❌ FreeSWITCH failed to start"
fi

# ── 4. Backend ──
echo ""
echo "[4/4] Starting Backend..."
pkill -f 'uvicorn app.main' 2>/dev/null || true
sleep 1

cd "$PROJECT_DIR/backend"
export FREESWITCH_BRIDGE_ENABLED=true
export REDIS_URL=""
export FREESWITCH_ESL_HOST=127.0.0.1
export FREESWITCH_ESL_PORT=8021
export FREESWITCH_ESL_PASSWORD=ClueCon
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:1.5b
export STT_PROVIDER=whisper
export LLM_PROVIDER=ollama
export TTS_PROVIDER=kokoro
export SIP_ENABLED=true
export AUTH_BYPASS=true
export WHISPER_MODEL_SIZE=tiny

nohup ./venv/bin/python -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 \
  --log-level warning \
  > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

echo ""
echo "Waiting 30s for backend initialization..."
sleep 30

echo ""
echo "=== Health Check ==="
curl -sf http://127.0.0.1:8000/health 2>&1 | head -c 500 || echo "❌ Health endpoint not responding"

echo ""
echo "=== Backend Log ==="
tail -20 /tmp/backend.log 2>&1

echo ""
echo "=========================================="
echo "  Stack Status"
echo "=========================================="
redis-cli ping 2>/dev/null && echo "  ✅ Redis" || echo "  ❌ Redis"
curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && echo "  ✅ Ollama" || echo "  ❌ Ollama"
docker ps -q --filter name=ai-freeswitch 2>/dev/null | grep -q . && echo "  ✅ FreeSWITCH" || echo "  ❌ FreeSWITCH"
ps aux | grep 'uvicorn app.main' | grep -v grep >/dev/null 2>&1 && echo "  ✅ Backend" || echo "  ❌ Backend"
