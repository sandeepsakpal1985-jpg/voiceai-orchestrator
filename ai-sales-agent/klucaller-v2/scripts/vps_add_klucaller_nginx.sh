#!/usr/bin/env bash
# Add klucaller.creamylane.com to the EXISTING kluknow-production nginx (additive).
# REQUIRES explicit approval: APPROVE_NGINX=1
# Does NOT stop/remove/recreate any existing container. Backs up nginx.conf before edit.
set -euo pipefail

if [[ "${APPROVE_NGINX:-}" != "1" ]]; then
  echo "REFUSED: nginx will not be modified without APPROVE_NGINX=1"
  echo "Complete Phase 1 (127.0.0.1:8090 health) and Phase 2 (DNS) first."
  echo "Review deployment/nginx-klucaller.inc.conf and deployment/VPS_SAFETY_RULES.md"
  exit 1
fi

NGINX_CONF="${NGINX_CONF:-/opt/kluknow/enterprise/production/nginx/nginx.conf}"
NGINX_CONTAINER="${NGINX_CONTAINER:-kluknow-production-nginx-1}"
BACKUP_DIR="${BACKUP_DIR:-/opt/klucare/backups/kluknow-nginx}"
DOMAIN="${DOMAIN:-klucaller.creamylane.com}"
UPSTREAM_PORT="${KLUCALLER_UPSTREAM_PORT:-8090}"
# Nginx runs inside Docker; reach host-published KluCaller via docker bridge gateway.
UPSTREAM_HOST="${KLUCALLER_UPSTREAM_HOST:-172.17.0.1}"

TS=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

if [[ ! -f "$NGINX_CONF" ]]; then
  echo "ERROR: nginx config not found at $NGINX_CONF"
  exit 1
fi

cp "$NGINX_CONF" "${BACKUP_DIR}/nginx.conf.${TS}.pre-${DOMAIN//./-}"

if grep -q "server_name ${DOMAIN}" "$NGINX_CONF"; then
  echo "Blocks for ${DOMAIN} already present in $NGINX_CONF"
else
  cat >> "$NGINX_CONF" <<NGINX_EOF

# HTTP — ${DOMAIN} (ADDITIVE — KluCaller V2)
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://${DOMAIN}\$request_uri;
    }
}

# HTTPS — ${DOMAIN} (ADDITIVE — cert required; issue via scripts/issue_cert_klucaller.sh)
server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN};

    client_max_body_size 50m;

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;

    location /livekit/ {
        proxy_pass http://${UPSTREAM_HOST}:7880/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX_EOF
  echo "Added ${DOMAIN} nginx blocks (upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT})"
fi

echo "Testing nginx config in ${NGINX_CONTAINER}..."
if docker exec "$NGINX_CONTAINER" nginx -t 2>&1; then
  docker exec "$NGINX_CONTAINER" nginx -s reload
  echo "Nginx reloaded OK"
else
  echo "NGINX_TEST_FAILED — cert likely missing for ${DOMAIN}"
  echo "Restore backup: cp ${BACKUP_DIR}/nginx.conf.${TS}.pre-${DOMAIN//./-} $NGINX_CONF"
  echo "Or issue cert first: ./scripts/issue_cert_klucaller.sh"
  exit 1
fi

echo "Probe upstream (from host):"
curl -sf "http://127.0.0.1:${UPSTREAM_PORT}/health/live" && echo " app OK" || echo " app not reachable on :${UPSTREAM_PORT}"
