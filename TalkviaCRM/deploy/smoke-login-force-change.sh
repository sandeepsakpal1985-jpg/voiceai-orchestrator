#!/bin/bash
set -e
COOKIE=$(mktemp)
trap 'rm -f "$COOKIE"' EXIT
PAGE=$(curl -s -c "$COOKIE" https://crm.klucare.com/login.php)
CSRF=$(printf '%s' "$PAGE" | sed -n 's/.*name="csrf" value="\([a-f0-9]*\)".*/\1/p' | head -1)
echo "csrf_len=${#CSRF}"
HDR=$(curl -s -D - -o /tmp/login-body.html -b "$COOKIE" -c "$COOKIE" -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrf=$CSRF" \
  --data-urlencode "email=om@klucare.com" \
  --data-urlencode "password=TalkVia!1" \
  https://crm.klucare.com/login.php)
echo "$HDR" | tr -d '\r' | grep -iE '^(HTTP/|Location:)' || true
if grep -qi 'change-password' <<<"$HDR"; then
  echo "PASS: redirected to change-password"
else
  echo "FAIL: expected change-password redirect"
  echo "$HDR" | head -20
  exit 1
fi
