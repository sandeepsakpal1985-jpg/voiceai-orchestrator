#!/usr/bin/env bash
# Complete native FreeSWITCH setup
set -euo pipefail

FS_DIR="/opt/freeswitch-native"
FS_BIN="$FS_DIR/bin/freeswitch"
FS_CLI="$FS_DIR/bin/fs_cli"
CONFIG_SRC="/opt/ai-sales-agent/telephony/configs/freeswitch"
BACKEND="/opt/ai-sales-agent/backend"

echo "=== Step 1: Fix library path ==="
# Find where libfreeswitch is
LIB_FS=$(find "$FS_DIR" -name "libfreeswitch*" -type f 2>/dev/null | head -1)
echo "libfreeswitch at: $LIB_FS"
LIB_DIR=$(dirname "$LIB_FS")
echo "Library dir: $LIB_DIR"

# Create ld.so.conf entry
echo "$LIB_DIR" > /etc/ld.so.conf.d/freeswitch.conf
ldconfig
echo "Library path configured"

echo ""
echo "=== Step 2: Verify binary ==="
ldd "$FS_BIN" 2>&1 | grep -i "not found" | head -5 || echo "All libraries found!"
"$FS_BIN" -version 2>&1 | head -1 || echo "Version check done"

echo ""
echo "=== Step 3: Configure FreeSWITCH with AI agent configs ==="
# Backup original configs
mkdir -p "$FS_DIR/conf"
cp -r "$FS_DIR/conf" "$FS_DIR/conf.original" 2>/dev/null || true

# Copy our AI agent configs
if [ -d "$CONFIG_SRC" ]; then
  # Copy files individually to avoid overwriting directory structure issues
  cp "$CONFIG_SRC/event_socket.conf.xml" "$FS_DIR/conf/autoload_configs/event_socket.conf.xml" 2>/dev/null || true
  cp "$CONFIG_SRC/vars.xml" "$FS_DIR/conf/vars.xml" 2>/dev/null || true
  cp "$CONFIG_SRC/dialplan/default.xml" "$FS_DIR/conf/dialplan/default.xml" 2>/dev/null || true
  
  # Copy extension files
  mkdir -p "$FS_DIR/conf/directory/default"
  cp "$CONFIG_SRC/directory/default/"*.xml "$FS_DIR/conf/directory/default/" 2>/dev/null || true
  
  # Copy SIP profiles
  cp "$CONFIG_SRC/sip_profiles/internal.xml" "$FS_DIR/conf/sip_profiles/internal.xml" 2>/dev/null || true
  cp "$CONFIG_SRC/sip_profiles/external.xml" "$FS_DIR/conf/sip_profiles/external.xml" 2>/dev/null || true
  
  # Copy AI bridge config
  cp "$CONFIG_SRC/ai_bridge.xml" "$FS_DIR/conf/autoload_configs/ai_bridge.xml" 2>/dev/null || true
  
  echo "AI agent configs applied"
else
  echo "Config source $CONFIG_SRC not found, using default configs"
fi

echo ""
echo "=== Step 4: Fix event_socket.conf.xml listen-ip ==="
ESL_CONF="$FS_DIR/conf/autoload_configs/event_socket.conf.xml"
if [ -f "$ESL_CONF" ]; then
  sed -i 's|listen-ip value="::"|listen-ip value="0.0.0.0"|g' "$ESL_CONF"
  grep "listen-ip" "$ESL_CONF"
  echo "ESL config fixed"
fi

echo ""
echo "=== Step 5: Create startup script ==="
cat > "$FS_DIR/start.sh" << 'SCRIPT'
#!/usr/bin/env bash
export LD_LIBRARY_PATH=/opt/freeswitch-native/libfreeswitch:/opt/freeswitch-native/lib
export FREESWITCH_CONFDIR=/opt/freeswitch-native/conf
exec /opt/freeswitch-native/bin/freeswitch -conf /opt/freeswitch-native/conf \
  -log /opt/freeswitch-native/log \
  -db /opt/freeswitch-native/db \
  -htdocs /opt/freeswitch-native/htdocs \
  -scripts /opt/freeswitch-native/scripts \
  -grammar /opt/freeswitch-native/grammar \
  -sounds /opt/freeswitch-native/sounds \
  -nonat "$@"
SCRIPT
chmod +x "$FS_DIR/start.sh"

echo ""
echo "=== Step 6: Create log/db/htdocs dirs ==="
mkdir -p "$FS_DIR/log" "$FS_DIR/db" "$FS_DIR/htdocs"

echo ""
echo "=== Step 7: Service script ==="
cat > /usr/local/bin/freeswitch-start << 'SVC'
#!/usr/bin/env bash
echo "Starting FreeSWITCH native (PID: $$)..."
/opt/freeswitch-native/start.sh -nc &
sleep 3
echo "FreeSWITCH started"
/opt/freeswitch-native/bin/fs_cli -x "status" 2>&1 | head -3
SVC
chmod +x /usr/local/bin/freeswitch-start

echo ""
echo "=== Setup complete ==="
echo "Run: sudo /usr/local/bin/freeswitch-start"
echo "Or: /opt/freeswitch-native/start.sh"
