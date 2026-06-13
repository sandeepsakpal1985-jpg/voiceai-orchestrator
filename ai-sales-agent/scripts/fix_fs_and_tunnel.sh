#!/bin/bash
set -e
echo "=== 1. Fix FreeSWITCH ESL Config ==="
docker exec ai-freeswitch sed -i 's|listen-ip value="::"|listen-ip value="0.0.0.0"|' /etc/freeswitch/autoload_configs/event_socket.conf.xml
docker exec ai-freeswitch grep "listen-ip" /etc/freeswitch/autoload_configs/event_socket.conf.xml
echo "=== 2. Copy cloudflared ==="
cp /tmp/cloudflared2 /usr/local/bin/cloudflared 2>/dev/null || true
chmod +x /usr/local/bin/cloudflared 2>/dev/null || true
echo "cloudflared: $(/usr/local/bin/cloudflared --version 2>&1)"
echo "=== 3. Start tunnel ==="
pkill cloudflared 2>/dev/null || true
nohup /usr/local/bin/cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate > /tmp/cloudflared.log 2>&1 &
sleep 12
echo "=== 4. Public URL ==="
grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' /tmp/cloudflared.log | head -1
echo "=== 5. FS Status ==="
docker ps --filter name=ai-freeswitch --format "{{.Names}} {{.Status}}"
echo "=== 6. ESL Test ==="
timeout 5 bash -c 'echo -e "auth ClueCon\n\n" | nc -w 3 127.0.0.1 8021' 2>&1 | head -c 200
echo ""
echo "DONE"
