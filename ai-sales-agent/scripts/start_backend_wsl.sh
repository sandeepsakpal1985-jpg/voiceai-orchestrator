#!/usr/bin/env bash
set -euo pipefail

cd /opt/ai-sales-agent/backend

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

PYTHON=/opt/ai-sales-agent/backend/venv/bin/python

echo "Starting backend with uvicorn on port 8000..."
nohup $PYTHON -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --log-level warning \
  > /tmp/backend.log 2>&1 &

BACKEND_PID=$!
echo "PID: $BACKEND_PID"

echo "Waiting 20s for startup..."
sleep 20

echo ""
echo "=== Backend status check ==="
curl -sf http://127.0.0.1:8000/health 2>&1 || echo "Health endpoint not responding"

echo ""
echo "=== Backend log tail ==="
tail -20 /tmp/backend.log 2>&1 || echo "No log file"
