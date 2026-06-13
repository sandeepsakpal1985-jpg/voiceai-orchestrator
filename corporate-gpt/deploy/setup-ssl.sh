#!/bin/bash
# CorporateGPT SSL Setup
set -e

DOMAIN=${1:-"corpgpt.local"}
EMAIL=${2:-"admin@$DOMAIN"}

apt-get update && apt-get install -y certbot
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

mkdir -p deploy/ssl
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem deploy/ssl/cert.pem
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem deploy/ssl/key.pem

echo "SSL certificates provisioned for $DOMAIN"
echo "0 0 * * * root certbot renew --post-hook 'docker-compose -f deploy/docker-compose.prod.yml restart nginx'" > /etc/cron.d/certbot-renew
