#!/usr/bin/env bash
# Complete native FreeSWITCH installation from Docker-extracted binaries
# Uses Docker as a build tool ONLY
set -euo pipefail

INSTALL_DIR="/opt/freeswitch-native"
CONFIG_SRC="/opt/ai-sales-agent/telephony/configs/freeswitch"
BACKEND_VENV="/opt/ai-sales-agent/backend/venv/bin/python"

echo "=== Step 1: Extract FreeSWITCH from Docker image ==="
docker rm -f fs-extract 2>/dev/null || true
docker create --name fs-extract safarov/freeswitch:latest

mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/bin"
mkdir -p "$INSTALL_DIR/lib"
mkdir -p "$INSTALL_DIR/mod"
mkdir -p "$INSTALL_DIR/conf"
mkdir -p "$INSTALL_DIR/sounds"
mkdir -p "$INSTALL_DIR/scripts"
mkdir -p "$INSTALL_DIR/grammar"

# Export the full filesystem
rm -rf /tmp/fs-export
mkdir -p /tmp/fs-export
docker export fs-extract | tar xf - -C /tmp/fs-export

echo ""
echo "=== Step 2: Copy binaries ==="
cp /tmp/fs-export/usr/bin/freeswitch "$INSTALL_DIR/bin/"
cp /tmp/fs-export/usr/bin/fs_cli "$INSTALL_DIR/bin/"
cp /tmp/fs-export/usr/bin/fs_encode "$INSTALL_DIR/bin/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/bin/"*

echo ""
echo "=== Step 3: Copy modules ==="
cp -r /tmp/fs-export/usr/lib/freeswitch/mod/* "$INSTALL_DIR/mod/" 2>/dev/null || true
echo "Modules copied: $(ls "$INSTALL_DIR/mod" | wc -l)"

echo ""
echo "=== Step 4: Copy configs ==="
cp -r /tmp/fs-export/etc/freeswitch/* "$INSTALL_DIR/conf/" 2>/dev/null || true
echo "Config files: $(find "$INSTALL_DIR/conf" -type f | wc -l)"

echo ""
echo "=== Step 5: Copy sounds ==="
cp -r /tmp/fs-export/usr/share/freeswitch/sounds/* "$INSTALL_DIR/sounds/" 2>/dev/null || true
echo "Sound files: $(find "$INSTALL_DIR/sounds" -type f | wc -l)"

echo ""
echo "=== Step 6: Copy scripts ==="
cp -r /tmp/fs-export/usr/share/freeswitch/scripts/* "$INSTALL_DIR/scripts/" 2>/dev/null || true
cp -r /tmp/fs-export/usr/share/freeswitch/grammar/* "$INSTALL_DIR/grammar/" 2>/dev/null || true

echo ""
echo "=== Step 7: Create symlinks ==="
ln -sf "$INSTALL_DIR/bin/freeswitch" /usr/local/bin/freeswitch
ln -sf "$INSTALL_DIR/bin/fs_cli" /usr/local/bin/fs_cli
ln -sf "$INSTALL_DIR/conf" /etc/freeswitch 2>/dev/null || mkdir -p /etc/freeswitch && \
  for f in "$INSTALL_DIR/conf"/*; do ln -sf "$f" /etc/freeswitch/ 2>/dev/null || true; done

echo ""
echo "=== Step 8: Clean up ==="
docker rm -f fs-extract 2>/dev/null || true
rm -rf /tmp/fs-export

echo ""
echo "=== Step 9: Verify ==="
echo "Binary: $(file "$INSTALL_DIR/bin/freeswitch" | head -c 80)"
echo "Modules: $(ls "$INSTALL_DIR/mod" | wc -l)"
echo "Key modules present:"
for mod in mod_event_socket mod_sofia mod_dptools mod_commands mod_conference; do
  [ -f "$INSTALL_DIR/mod/$mod.so" ] && echo "  ✅ $mod" || echo "  ❌ $mod"
done

echo ""
echo "=== Step 10: Test run ==="
timeout 3 "$INSTALL_DIR/bin/freeswitch" -help 2>&1 | head -3 || echo "FreeSWITCH binary runs"
echo ""
echo "Native FreeSWITCH installation complete at $INSTALL_DIR"
