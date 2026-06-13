#!/usr/bin/env bash
set -euo pipefail

cd /opt/ai-sales-agent/backend

# Kill old processes
pkill -f uvicorn 2>/dev/null || true
sleep 2

# Minimal env vars - no FreeSWITCH to avoid startup blocking
export FREESWITCH_BRIDGE_ENABLED=false
export REDIS_URL=""
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:1.5b
export STT_PROVIDER=whisper
export LLM_PROVIDER=ollama
export TTS_PROVIDER=kokoro
export AUTH_BYPASS=true
export WHISPER_MODEL_SIZE=tiny
export LIVEKIT_ENABLED=false
export SIP_ENABLED=false

nohup ./venv/bin/python -m uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 \
  --log-level info \
  > /tmp/backend_simple.log 2>&1 &

PID=$!
echo "Backend started with PID: $PID"

# Wait and check
sleep 15
echo ""
echo "=== Health check ==="
curl -s http://127.0.0.1:8000/health 2>&1 | head -c 300 || echo "Not ready yet"
echo ""
echo "=== Log tail ==="
tail -10 /tmp/backend_simple.log 2>/dev/null || echo "No log"
