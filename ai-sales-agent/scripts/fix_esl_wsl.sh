#!/usr/bin/env bash
# Fix listen-ip in FreeSWITCH event_socket.conf.xml
set -euo pipefail

FILE="/opt/ai-sales-agent/telephony/configs/freeswitch/event_socket.conf.xml"

echo "Before fix:"
grep "listen-ip" "$FILE"

# Use sed to replace :: with 0.0.0.0 on the listen-ip line
sed -i 's|listen-ip value="::"|listen-ip value="0.0.0.0"|g' "$FILE"

echo ""
echo "After fix:"
grep "listen-ip" "$FILE"
