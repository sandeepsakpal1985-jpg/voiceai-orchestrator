#!/usr/bin/env bash
# Phase 1 only — private KluCaller deploy on 127.0.0.1:8090.
# Does NOT touch DNS, TLS, nginx, or existing klucare/kluknow containers.
# See deployment/VPS_SAFETY_RULES.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST_PORT="${KLUCALLER_HOST_PORT:-8090}"
BIND_HOST="${KLUCALLER_BIND_HOST:-127.0.0.1}"

echo "==> KluCaller Phase 1 — private deploy"
echo "    root=$ROOT"
echo "    bind=${BIND_HOST}:${HOST_PORT}"
echo "    (no nginx / no public exposure in this phase)"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not installed."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "==> Creating .env from deployment/env.hostinger.example"
  cp deployment/env.hostinger.example .env
  echo "    Edit .env if needed, then re-run."
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

echo "==> Validating compose"
docker compose \
  -f deployment/docker-compose.yml \
  -f deployment/docker-compose.hostinger.yml \
  config >/dev/null

echo "==> Building and starting (app + livekit — LiveKit internal only)"
docker compose \
  -f deployment/docker-compose.yml \
  -f deployment/docker-compose.hostinger.yml \
  up -d --build

echo "==> Waiting for health on http://127.0.0.1:${HOST_PORT}"
LIVE_OK=0
READY_OK=0
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${HOST_PORT}/health/live" >/dev/null 2>&1 && LIVE_OK=1
  curl -sf "http://127.0.0.1:${HOST_PORT}/health/ready" >/dev/null 2>&1 && READY_OK=1
  [[ "$LIVE_OK" -eq 1 && "$READY_OK" -eq 1 ]] && break
  sleep 2
done

docker compose -f deployment/docker-compose.yml -f deployment/docker-compose.hostinger.yml ps

echo ""
if [[ "$LIVE_OK" -eq 1 && "$READY_OK" -eq 1 ]]; then
  echo "PHASE 1 PASS — KluCaller works independently of nginx."
  curl -sf "http://127.0.0.1:${HOST_PORT}/health/live"; echo
  curl -sf "http://127.0.0.1:${HOST_PORT}/health/ready"; echo
else
  echo "PHASE 1 FAIL — fix app before any DNS/nginx step."
  echo "  live=$LIVE_OK ready=$READY_OK"
  exit 1
fi

echo ""
echo "STOP — do not proceed automatically."
echo "Phase 2 (DNS): create klucaller A → VPS IP; verify externally."
echo "Phase 3 (TLS+nginx): review deployment/nginx-klucaller.inc.conf;"
echo "  then APPROVE_NGINX=1 ./scripts/vps_add_klucaller_nginx.sh"
echo "See deployment/VPS_SAFETY_RULES.md"
