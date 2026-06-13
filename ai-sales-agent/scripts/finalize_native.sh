#!/usr/bin/env bash
set -euo pipefail

FS_DIR="/opt/freeswitch-native"
BACKEND_DIR="/opt/ai-sales-agent/backend"

echo "=== Step 1: Find all library files ==="
find "$FS_DIR" -name "libfreeswitch*" -type f 2>/dev/null
echo "---"
find "$FS_DIR" -name "*.so*" -type f 2>/dev/null | wc -l
echo "shared libraries found"
echo "---"
# Find the actual lib directory
find "$FS_DIR" -name "libfreeswitch.so*" 2>/dev/null
echo ""

echo "=== Step 2: Set correct LD path ==="
# If libfreeswitch is in libfreeswitch/ directory
LIB_DIR=$(find "$FS_DIR" -name "libfreeswitch.so*" -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo "")
echo "Library directory: $LIB_DIR"

if [ -n "$LIB_DIR" ]; then
  echo "$LIB_DIR" | tee /etc/ld.so.conf.d/freeswitch.conf
  ldconfig
  echo "ldconfig done"
fi

echo ""
echo "=== Step 3: Test binary ==="
export LD_LIBRARY_PATH="${LIB_DIR:-$FS_DIR/libfreeswitch}:$LD_LIBRARY_PATH"
ldd "$FS_DIR/bin/freeswitch" 2>&1 | grep -i "not found" | head -5 || echo "All libraries resolved!"

echo ""
echo "=== Step 4: Check backend status ==="
curl -s http://127.0.0.1:8000/health 2>/dev/null | head -c 200 || echo "Backend not running"
echo ""

echo "=== Step 5: Check Ollama ==="
curl -s http://127.0.0.1:11434/api/tags 2>/dev/null | head -c 100 || echo "Ollama not running"
echo ""

echo "=== Step 6: Check Redis ==="
redis-cli ping 2>/dev/null || echo "Redis not running"
echo ""

echo "=== Step 7: Frontend files check ==="
echo "Available frontend files for test link:"
find "$BACKEND_DIR/../frontend" -type f 2>/dev/null | head -10 || echo "No frontend dir"
find "$BACKEND_DIR/.." -name "voice-chat*" -type f 2>/dev/null | head -5 || echo "No voice-chat files"

echo ""
echo "=== Done ==="
echo "To start FreeSWITCH: /opt/freeswitch-native/start.sh"
echo "Or with debug: /opt/freeswitch-native/bin/freeswitch -conf /opt/freeswitch-native/conf -nonat"
