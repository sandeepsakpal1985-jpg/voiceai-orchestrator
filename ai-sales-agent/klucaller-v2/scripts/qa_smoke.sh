#!/usr/bin/env bash
# Post-deploy QA smoke (run on VPS or laptop against public URL).
set -euo pipefail

BASE="${1:-https://klucaller.creamylane.com}"
BASE="${BASE%/}"

pass=0
fail=0

check() {
  local name="$1"
  local url="$2"
  local expect="$3"
  code="$(curl -s -o /tmp/kc_body.txt -w "%{http_code}" "$url" || true)"
  body="$(cat /tmp/kc_body.txt 2>/dev/null || true)"
  if [[ "$code" == "$expect" ]] && echo "$body" | grep -q .; then
    echo "PASS  $name  HTTP $code"
    pass=$((pass + 1))
  else
    echo "FAIL  $name  HTTP $code  body=${body:0:120}"
    fail=$((fail + 1))
  fi
}

echo "QA smoke against $BASE"
check "live"  "$BASE/health/live"  200
check "ready" "$BASE/health/ready" 200
check "voice" "$BASE/voice"        200
check "home"  "$BASE/"             200

if echo "$(cat /tmp/kc_body.txt 2>/dev/null || true)" | grep -qi "ready\|mumbai\|klucaller\|html" ; then
  :
fi

# ready JSON fields
ready="$(curl -sf "$BASE/health/ready" || true)"
echo "$ready" | grep -q '"knowledge_seeded":true' && echo "PASS  knowledge_seeded" && pass=$((pass+1)) || { echo "FAIL  knowledge_seeded"; fail=$((fail+1)); }
echo "$ready" | grep -q 'mumbai-dental' && echo "PASS  tenant mumbai-dental" && pass=$((pass+1)) || { echo "FAIL  tenant"; fail=$((fail+1)); }

echo ""
echo "Passed=$pass Failed=$fail"
[[ "$fail" -eq 0 ]]
