#!/usr/bin/env bash
# ==============================================================================
# AI Sales Agent — Health Validation Script (Native Mode)
# ==============================================================================
# Validates all components of the AI Sales Agent stack:
#   - Backend (FastAPI HTTP health endpoint)
#   - Ollama (LLM API)
#   - Redis (ping)
#   - FreeSWITCH (ESL connectivity, SIP registration)
#   - STT/LLM/TTS providers (via backend health sub-endpoints)
#   - Audio cache directory
#
# Usage:
#   ./scripts/check_health.sh                          # Check all components
#   ./scripts/check_health.sh --verbose                 # Detailed output
#   ./scripts/check_health.sh --json                    # JSON output (for monitoring)
#   ./scripts/check_health.sh --watch                   # Continuous monitoring (every 10s)
#   ./scripts/check_health.sh --only backend            # Check only backend
#   ./scripts/check_health.sh --only ollama             # Check only Ollama
#   ./scripts/check_health.sh --only redis              # Check only Redis
#   ./scripts/check_health.sh --only freeswitch         # Check only FreeSWITCH
#
# Exit codes:
#   0 - All checks passed
#   1 - Some checks failed
#   2 - Critical check failed
# ==============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
FREESWITCH_ESL_HOST="${FREESWITCH_ESL_HOST:-127.0.0.1}"
FREESWITCH_ESL_PORT="${FREESWITCH_ESL_PORT:-8021}"
FREESWITCH_SIP_PORT="${FREESWITCH_SIP_PORT:-5060}"
TIMEOUT_SEC="${TIMEOUT_SEC:-5}"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Flags ─────────────────────────────────────────────────────────────────────
VERBOSE=false
JSON_OUTPUT=false
WATCH_MODE=false
ONLY_FILTER=""

for arg in "$@"; do
  case "$arg" in
    --verbose)   VERBOSE=true ;;
    --json)      JSON_OUTPUT=true ;;
    --watch)     WATCH_MODE=true ;;
    --only=*)    ONLY_FILTER="${arg#--only=}" ;;
  esac
done

# ── State ─────────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
CHECK_RESULTS=()

# ── Helpers ───────────────────────────────────────────────────────────────────
pass() { CHECK_RESULTS+=("PASS:$*"); PASS_COUNT=$((PASS_COUNT + 1)); [ "$JSON_OUTPUT" = false ] && echo -e "  ${GREEN}✅ PASS:${NC} $*"; }
fail() { CHECK_RESULTS+=("FAIL:$*"); FAIL_COUNT=$((FAIL_COUNT + 1)); [ "$JSON_OUTPUT" = false ] && echo -e "  ${RED}❌ FAIL:${NC} $*"; }
warn() { CHECK_RESULTS+=("WARN:$*"); WARN_COUNT=$((WARN_COUNT + 1)); [ "$JSON_OUTPUT" = false ] && echo -e "  ${YELLOW}⚠️  WARN:${NC} $*"; }
header() { [ "$JSON_OUTPUT" = false ] && echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

should_check() {
  [ -z "$ONLY_FILTER" ] || [ "$ONLY_FILTER" = "$1" ]
}

# ── JSON Output Setup ────────────────────────────────────────────────────────
json_start() { echo '{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","status":"running","checks":['; }
json_end()   {
  local overall="pass"
  [ "$FAIL_COUNT" -gt 0 ] && overall="fail"
  [ "$FAIL_COUNT" -eq 0 ] && [ "$WARN_COUNT" -gt 0 ] && overall="warn"
  echo '],"summary":{"pass":'"$PASS_COUNT"',"fail":'"$FAIL_COUNT"',"warn":'"$WARN_COUNT"',"overall":"'"$overall"'"}}'
}

json_check() {
  local status="$1" name="$2" detail="$3"
  printf '{"check":"%s","status":"%s","detail":"%s"},' "$name" "$status" "$(echo "$detail" | sed 's/"/\\"/g')"
}

# ══════════════════════════════════════════════════════════════════════════════
# CHECK FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

check_backend() {
  header "Backend (FastAPI) — ${BACKEND_URL}"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    local status
    status=$(curl -sf --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
    pass "Backend HTTP ${BACKEND_URL}/health -> ${status}"

    # Check version
    local version
    version=$(curl -sf --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
    [ "$VERBOSE" = true ] && pass "  Backend version: ${version}"

    if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "backend" "HTTP 200, status=${status}, version=${version}"; fi
  else
    fail "Backend HTTP ${BACKEND_URL}/health -> ${http_code} (expected 200)"
    if [ "$JSON_OUTPUT" = true ]; then json_check "fail" "backend" "HTTP ${http_code}"; fi
  fi
}

check_backend_providers() {
  header "Backend — Provider Health"

  for provider in stt llm tts; do
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health/${provider}" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
      local pstatus
      pstatus=$(curl -sf --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health/${provider}" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
      pass "${provider^^} provider: ${pstatus}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "${provider}" "${pstatus}"; fi
    else
      warn "${provider^^} provider: HTTP ${http_code}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "${provider}" "HTTP ${http_code}"; fi
    fi
  done
}

check_ollama() {
  header "Ollama (LLM) — ${OLLAMA_URL}"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "${OLLAMA_URL}/api/tags" 2>/dev/null || echo "000")

  if [ "$http_code" = "200" ]; then
    local models
    models=$(curl -sf --max-time "$TIMEOUT_SEC" "${OLLAMA_URL}/api/tags" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = [m['name'] for m in data.get('models', [])]
    print(', '.join(models) if models else 'none')
except: print('parse_error')
" 2>/dev/null || echo "parse_error")
    pass "Ollama API responding (models: ${models})"
    if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "ollama" "models: ${models}"; fi
  else
    fail "Ollama HTTP ${OLLAMA_URL}/api/tags -> ${http_code}"
    if [ "$JSON_OUTPUT" = true ]; then json_check "fail" "ollama" "HTTP ${http_code}"; fi
  fi
}

check_redis() {
  header "Redis — ${REDIS_HOST}:${REDIS_PORT}"

  if command -v redis-cli &>/dev/null; then
    local ping
    ping=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || echo "FAIL")
    if [ "$ping" = "PONG" ]; then
      local info
      info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" info server 2>/dev/null | grep -i "redis_version" | head -1 || echo "unknown")
      pass "Redis PONG (${info})"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "redis" "PONG, ${info}"; fi
    else
      fail "Redis ping failed: ${ping}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "fail" "redis" "PONG failed"; fi
    fi
  else
    # Try via /health endpoint which checks persistence
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/health" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
      warn "redis-cli not installed; backend health available"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "redis" "cli not available"; fi
    else
      fail "Redis not reachable and backend not available"
      if [ "$JSON_OUTPUT" = true ]; then json_check "fail" "redis" "unreachable"; fi
    fi
  fi
}

check_freeswitch() {
  header "FreeSWITCH"

  # Check ESL via fs_cli
  if command -v fs_cli &>/dev/null; then
    local status
    status=$(fs_cli -x "status" 2>/dev/null | head -3 || echo "FAIL")
    if echo "$status" | grep -qi "UP"; then
      local version
      version=$(echo "$status" | head -1)
      pass "FreeSWITCH ESL: ${version}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "freeswitch_esl" "${version}"; fi
    else
      fail "FreeSWITCH ESL not responding: ${status}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "fail" "freeswitch_esl" "not responding"; fi
    fi

    # Check SIP gateway registration status (e.g., plivo, twilio)
    local sip_gateways
    sip_gateways=$(fs_cli -x "sofia status gateway" 2>/dev/null | grep -E "(REGED|REGFAIL|NOREG|TRYING)" || echo "")
    if [ -n "$sip_gateways" ]; then
      local registered
      local failed
      registered=$(echo "$sip_gateways" | grep -c "REGED" || echo 0)
      failed=$(echo "$sip_gateways" | grep -cE "REGFAIL|NOREG" || echo 0)
      if [ "$failed" -gt 0 ]; then
        warn "SIP gateway registration: ${registered} registered, ${failed} failed"
        if [ "$VERBOSE" = true ]; then
          echo "$sip_gateways" | while IFS= read -r line; do echo "    $line"; done
        fi
        if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "freeswitch_sip_reg" "${registered} registered, ${failed} failed"; fi
      else
        pass "SIP gateway registration: ${registered} gateway(s) registered"
        if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "freeswitch_sip_reg" "${registered} gateways registered"; fi
      fi
    else
      warn "No SIP gateways configured (expected if no SIP trunk yet)"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "freeswitch_sip_reg" "no gateways configured"; fi
    fi
  else
    # Check via backend fs/health endpoint
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/fs/health" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
      local fs_status
      fs_status=$(curl -sf --max-time "$TIMEOUT_SEC" "${BACKEND_URL}/fs/health" 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('esl_connected=' + str(data.get('esl_connected', False)) + ', active_calls=' + str(data.get('active_calls', 0)))
except: print('parse_error')
" 2>/dev/null || echo "parse_error")
      pass "FreeSWITCH bridge: ${fs_status}"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "freeswitch_bridge" "${fs_status}"; fi
    else
      warn "FreeSWITCH bridge: HTTP ${http_code} (not critical if no calls yet)"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "freeswitch_bridge" "HTTP ${http_code}"; fi
    fi
  fi

  # Check SIP port
  if command -v nc &>/dev/null; then
    if nc -z -w3 "$FREESWITCH_ESL_HOST" "$FREESWITCH_SIP_PORT" 2>/dev/null; then
      pass "FreeSWITCH SIP port ${FREESWITCH_SIP_PORT} is open"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "freeswitch_sip" "port ${FREESWITCH_SIP_PORT} open"; fi
    else
      warn "FreeSWITCH SIP port ${FREESWITCH_SIP_PORT} not reachable"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "freeswitch_sip" "port ${FREESWITCH_SIP_PORT} not reachable"; fi
    fi
  fi

  # Check ESL port
  if command -v nc &>/dev/null; then
    if nc -z -w3 "$FREESWITCH_ESL_HOST" "$FREESWITCH_ESL_PORT" 2>/dev/null; then
      pass "FreeSWITCH ESL port ${FREESWITCH_ESL_PORT} is open"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "freeswitch_esl_port" "port ${FREESWITCH_ESL_PORT} open"; fi
    else
      warn "FreeSWITCH ESL port ${FREESWITCH_ESL_PORT} not reachable"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "freeswitch_esl_port" "port ${FREESWITCH_ESL_PORT} not reachable"; fi
    fi
  fi
}

check_audio_dir() {
  header "Audio Directory"

  local audio_dir="${FREESWITCH_AUDIO_DIR:-tmp_fs_audio}"
  if [ -d "$audio_dir" ]; then
    local count
    count=$(find "$audio_dir" -type f 2>/dev/null | wc -l)
    pass "Audio directory exists: ${audio_dir} (${count} files)"
    if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "audio_dir" "${audio_dir}, ${count} files"; fi
  else
    # Try deploy directory
    audio_dir="/opt/ai-sales-agent/tmp_fs_audio"
    if [ -d "$audio_dir" ]; then
      local count
      count=$(find "$audio_dir" -type f 2>/dev/null | wc -l)
      pass "Audio directory exists: ${audio_dir} (${count} files)"
      if [ "$JSON_OUTPUT" = true ]; then json_check "pass" "audio_dir" "${audio_dir}, ${count} files"; fi
    else
      warn "Audio directory not found (will be created on first call)"
      if [ "$JSON_OUTPUT" = true ]; then json_check "warn" "audio_dir" "not found"; fi
    fi
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# WATCH MODE
# ══════════════════════════════════════════════════════════════════════════════
watch_loop() {
  local interval="${1:-10}"
  echo -e "${CYAN}Watching health every ${interval}s...${NC}"
  echo ""
  while true; do
    clear 2>/dev/null || true
    echo -e "${CYAN}═══ AI Sales Agent — Health Watch (updated $(date +%H:%M:%S)) ═══${NC}"
    echo ""
    PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
    CHECK_RESULTS=()
    run_all_checks
    summary
    sleep "$interval"
  done
}

# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL CHECKS
# ══════════════════════════════════════════════════════════════════════════════
run_all_checks() {
  should_check "backend"    && check_backend
  should_check "backend"    && check_backend_providers
  should_check "ollama"     && check_ollama
  should_check "redis"      && check_redis
  should_check "freeswitch" && check_freeswitch
  should_check "freeswitch" && check_audio_dir
}

summary() {
  echo ""
  echo -e "${CYAN}━━━ Summary ━━━${NC}"
  echo -e "  ${GREEN}PASS: ${PASS_COUNT}${NC}  ${RED}FAIL: ${FAIL_COUNT}${NC}  ${YELLOW}WARN: ${WARN_COUNT}${NC}"

  if [ "$FAIL_COUNT" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✅ All checks passed!${NC}"
  elif [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "  ${YELLOW}⚠️  All critical checks passed (${WARN_COUNT} warnings)${NC}"
  else
    echo -e "  ${RED}❌ ${FAIL_COUNT} check(s) failed${NC}"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if [ "$WATCH_MODE" = true ]; then
  watch_loop
  exit 0
fi

if [ "$JSON_OUTPUT" = true ]; then
  json_start
fi

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       AI Sales Agent — Health Validation                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
[ -n "$ONLY_FILTER" ] && echo "Filter: ${ONLY_FILTER}"
echo ""

run_all_checks
summary

if [ "$JSON_OUTPUT" = true ]; then
  json_end
fi

# Exit code
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
