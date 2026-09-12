#!/usr/bin/env bash
# Issue Let's Encrypt cert for klucaller.creamylane.com via existing KluKnow ACME webroot.
# Does NOT edit KluKnow nginx/compose. Stores certs under /opt/klucare/certs (same as klucare).
set -euo pipefail

DOMAIN="${DOMAIN:-klucaller.creamylane.com}"
EMAIL="${CERTBOT_EMAIL:-sandeep.sakpal@gmail.com}"
CERT_DIR="${CERT_DIR:-/opt/klucare/certs}"
mkdir -p "$CERT_DIR" /opt/klucare/certbot-work /opt/klucare/certbot-logs

docker volume inspect kluknow-production_certbot_www >/dev/null

echo "Preflight: ACME webroot via KluKnow :80"
TEST_TOKEN="klucaller-preflight-$(date +%s)"
docker run --rm -v kluknow-production_certbot_www:/var/www/certbot alpine \
  sh -c "mkdir -p /var/www/certbot/.well-known/acme-challenge && echo ok > /var/www/certbot/.well-known/acme-challenge/${TEST_TOKEN}"
HTTP_CODE=$(curl -s -o /tmp/acme-klucaller.out -w '%{http_code}' "http://127.0.0.1/.well-known/acme-challenge/${TEST_TOKEN}" || true)
echo "preflight_http=${HTTP_CODE}"
docker run --rm -v kluknow-production_certbot_www:/var/www/certbot alpine \
  sh -c "rm -f /var/www/certbot/.well-known/acme-challenge/${TEST_TOKEN}"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: ACME webroot not serving on :80. Ensure DNS points ${DOMAIN} here and port 80 is reachable."
  exit 1
fi

echo "Requesting certificate for ${DOMAIN}..."
docker run --rm \
  -v kluknow-production_certbot_www:/var/www/certbot \
  -v "${CERT_DIR}:/etc/letsencrypt" \
  -v /opt/klucare/certbot-work:/var/lib/letsencrypt \
  -v /opt/klucare/certbot-logs:/var/log/letsencrypt \
  certbot/certbot:latest certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  --keep-until-expiring

ls -la "${CERT_DIR}/live/${DOMAIN}/" 2>/dev/null || ls -laR "${CERT_DIR}" | head -40
echo "CERT_OK — mount ${CERT_DIR}/live/${DOMAIN} into nginx or symlink per klucare pattern"
