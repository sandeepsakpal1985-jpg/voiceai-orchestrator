#!/usr/bin/env bash
# Build FreeSWITCH v1.10.12 from source inside WSL
# This also builds the required spandsp fork from FreeSWITCH's repo
# Usage: wsl -d Ubuntu -u root bash /opt/ai-sales-agent/scripts/build_freeswitch_wsl.sh
set -euo pipefail

SRC_DIR="/usr/local/src"
FS_DIR="$SRC_DIR/freeswitch"
LOG_FILE="/tmp/freeswitch_build.log"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }

# Install all build dependencies
log "=== Step 0: Installing all build dependencies ==="
apt-get update -qq 2>&1 | tail -1
apt-get install -y \
  autoconf automake libtool-bin pkg-config \
  libssl-dev libcurl4-openssl-dev libpcre3-dev libspeexdsp-dev \
  libldns-dev libedit-dev libtiff5-dev libpq-dev libsqlite3-dev \
  libsndfile1-dev libopus-dev yasm \
  libavformat-dev libavcodec-dev libavutil-dev libswresample-dev \
  libpng-dev libjpeg-dev libfreetype6-dev \
  liblua5.2-dev lua5.2 2>&1 | tail -3
log "Build dependencies installed"

# Build spandsp from FreeSWITCH fork
log "=== Step 1: Building spandsp (FreeSWITCH fork) ==="
cd "$SRC_DIR"
if [ ! -d "$SRC_DIR/spandsp" ]; then
    git clone https://github.com/freeswitch/spandsp.git 2>&1 | tail -3
fi
cd "$SRC_DIR/spandsp"
./bootstrap.sh 2>&1 | tail -3
./configure 2>&1 | tail -3
make -j$(nproc) 2>&1 | tail -3
make install 2>&1 | tail -3
ldconfig
log "spandsp built and installed"

# Build and install sofia-sip
log "=== Step 2: Building sofia-sip ==="
cd "$SRC_DIR"
if [ ! -d "$SRC_DIR/sofia-sip" ]; then
    git clone https://github.com/freeswitch/sofia-sip.git 2>&1 | tail -3
fi
cd "$SRC_DIR/sofia-sip"
./bootstrap.sh 2>&1 | tail -3
./configure 2>&1 | tail -3
make -j$(nproc) 2>&1 | tail -3
make install 2>&1 | tail -3
ldconfig
log "sofia-sip built and installed"

# Clone or update FreeSWITCH
log "=== Step 3: Cloning FreeSWITCH v1.10.12 ==="
if [ ! -d "$FS_DIR" ]; then
    git clone --depth 1 --branch v1.10.12 https://github.com/signalwire/freeswitch.git "$FS_DIR" 2>&1 | tail -3
fi

log "=== Step 4: Bootstrap FreeSWITCH ==="
cd "$FS_DIR"
./bootstrap.sh -j 2>&1 | tail -5

log "=== Step 5: Configure FreeSWITCH ==="
# Disable modules that need extra deps we don't have
./configure --disable-core-odbc-support --disable-core-pgsql-support 2>&1 | tail -5

log "=== Step 6: Build FreeSWITCH (15-30 min) ==="
make -j$(nproc) 2>&1 | tail -5

log "=== Step 7: Install FreeSWITCH ==="
make install 2>&1 | tail -3

log "=== Step 8: Build and install AI modules ==="
make -j$(nproc) mod_event_socket mod_sofia mod_dptools 2>&1 | tail -3
make install mod_event_socket mod_sofia mod_dptools 2>&1 | tail -3

log "=== BUILD COMPLETE ==="
freeswitch -version 2>&1 | head -1 | tee -a "$LOG_FILE"
