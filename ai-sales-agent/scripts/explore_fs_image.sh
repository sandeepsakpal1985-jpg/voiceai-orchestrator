#!/usr/bin/env bash
set -euo pipefail

echo "=== Step 1: Create stopped container ==="
docker rm -f fs-extract 2>/dev/null || true
docker create --name fs-extract safarov/freeswitch:latest

echo ""
echo "=== Step 2: Export container filesystem ==="
mkdir -p /tmp/fs-root
docker export fs-extract | tar xf - -C /tmp/fs-root 2>&1 | tail -3
echo "Export complete"

echo ""
echo "=== Step 3: Find all FreeSWITCH-related files ==="
echo "Binaries:"
find /tmp/fs-root -name "freeswitch" -type f 2>/dev/null | head -5
find /tmp/fs-root -name "fs_cli" -type f 2>/dev/null | head -5
echo ""
echo "Modules:"
find /tmp/fs-root -name "*.so" -path "*freeswitch*" 2>/dev/null | head -20
echo ""
echo "Configs:"
find /tmp/fs-root -name "freeswitch.xml" 2>/dev/null | head -5
find /tmp/fs-root -name "event_socket.conf.xml" 2>/dev/null | head -5
echo ""
echo "Sounds:"
find /tmp/fs-root -name "*.wav" -path "*freeswitch*" 2>/dev/null | head -10

echo ""
echo "=== Step 4: Determine install paths ==="
# Check where freeswitch binary lives
FS_BIN=$(find /tmp/fs-root -name "freeswitch" -type f 2>/dev/null | head -1)
echo "Binary at: $FS_BIN"
if [ -n "$FS_BIN" ]; then
    dirname "$FS_BIN" | sed "s|/tmp/fs-root||"
fi
echo ""
echo "Config dir:"
find /tmp/fs-root -path "*/freeswitch/freeswitch.xml" 2>/dev/null | head -1 | sed "s|/tmp/fs-root||" | xargs dirname 2>/dev/null || echo "Not found"

echo ""
echo "=== Step 5: Clean up ==="
rm -rf /tmp/fs-root
docker rm -f fs-extract 2>/dev/null || true
echo "Done"
