#!/usr/bin/env bash
# Extract FreeSWITCH from Docker image and install natively in WSL
set -euo pipefail

echo "=== Step 1: Create extract container ==="
docker rm -f fs-extract 2>/dev/null || true
docker create --name fs-extract safarov/freeswitch:latest 2>&1

echo ""
echo "=== Step 2: Extract files ==="
mkdir -p /opt/freeswitch-native
rm -rf /opt/freeswitch-native/*

# Copy binaries
docker cp fs-extract:/usr/bin/freeswitch /opt/freeswitch-native/ 2>&1
docker cp fs-extract:/usr/bin/fs_cli /opt/freeswitch-native/ 2>&1

# Copy libraries
docker cp fs-extract:/usr/lib/freeswitch /opt/freeswitch-native/libfreeswitch 2>&1

# Copy configs
docker cp fs-extract:/etc/freeswitch /opt/freeswitch-native/conf 2>&1

# Copy sounds
docker cp fs-extract:/usr/share/freeswitch /opt/freeswitch-native/sounds 2>&1 || true

echo ""
echo "=== Step 3: Clean up ==="
docker rm -f fs-extract 2>&1 || true

echo ""
echo "=== Step 4: Verify ==="
ls -la /opt/freeswitch-native/
echo ""
file /opt/freeswitch-native/freeswitch
echo ""
echo "Done! Binaries at /opt/freeswitch-native/"
