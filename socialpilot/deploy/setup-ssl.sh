#!/bin/bash
# MetaPilot AI — SSL Certificate Setup
#
# Usage: ./deploy/setup-ssl.sh yourdomain.com
#
# This script obtains Let's Encrypt SSL certificates for your domain
# and sets up auto-renewal.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <yourdomain.com>"
  echo "Example: $0 metapilot.ai"
  exit 1
fi

DOMAIN="$1"
API_DOMAIN="api.${DOMAIN}"
EMAIL="${2:-admin@${DOMAIN}}"

echo "🔐 Setting up SSL certificates for ${DOMAIN} and ${API_DOMAIN}..."

# ── Create ssl directory ──
mkdir -p deploy/ssl

# ── Check if certbot is installed ──
if ! command -v certbot &> /dev/null; then
  echo "📦 Installing certbot..."
  apt-get update && apt-get install -y certbot
fi

# ── Obtain certificates ──
echo "📜 Obtaining certificates..."
certbot certonly --standalone \
  --agree-tos \
  --non-interactive \
  --email "${EMAIL}" \
  --domains "${DOMAIN},${API_DOMAIN}" \
  --expand

# ── Copy certificates to nginx directory ──
echo "📋 Copying certificates..."
cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" deploy/ssl/
cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" deploy/ssl/
chmod 600 deploy/ssl/privkey.pem

# ── Set up auto-renewal ──
echo "🔄 Setting up auto-renewal..."
cat > /etc/cron.d/certbot-renew <<EOF
0 */12 * * * root certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /opt/socialpilot/deploy/ssl/ && cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem /opt/socialpilot/deploy/ssl/ && docker compose -f /opt/socialpilot/deploy/docker-compose.prod.yml restart nginx"
EOF

echo "✅ SSL setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update deploy/nginx.conf with your domain: ${DOMAIN}"
echo "  2. Update deploy/.env.prod.example with your secrets"
echo "  3. Run: ./deploy/deploy.sh"
