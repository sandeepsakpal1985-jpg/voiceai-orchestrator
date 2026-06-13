# Native GPU Server Deployment Guide

**Deploy AI Sales Agent on an Ubuntu GPU server without Docker.**

---

## Overview

This guide covers deploying the AI Sales Agent stack on a **bare-metal Ubuntu 22.04/24.04 server** with optional NVIDIA GPU acceleration. Unlike the Docker deployment path, this approach runs all services natively (systemd services, direct process management).

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Ubuntu 22.04/24.04 GPU Server                 │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Redis    │  │  Ollama  │  │FreeSWITCH│  │  FastAPI      │  │
│  │  :6379   │  │  :11434  │  │  :5060   │  │  :8000        │  │
│  └────┬─────┘  └────┬─────┘  │  :8021   │  └──────┬───────┘  │
│       │             │        └────┬─────┘         │          │
│       └─────────────┼─────────────┼───────────────┘          │
│                     │             │                           │
│                     └─────────────┘                           │
│                           │                                   │
│                    ┌──────▼──────┐                            │
│                    │  SIP Trunk  │                            │
│                    │ (Plivo/Twilio)                           │
│                    └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### Target Specs

| Component | Minimum | Recommended | Target (5-10 calls) |
|-----------|---------|-------------|---------------------|
| **CPU** | 4 cores | 8+ cores | 12+ cores |
| **RAM** | 8 GB | 16 GB | 32 GB |
| **GPU** | None (CPU) | RTX 3060 (12GB) | RTX 4090 (24GB) |
| **Disk** | 20 GB SSD | 50 GB NVMe | 100 GB NVMe |
| **Network** | 100 Mbps | 500 Mbps | 1 Gbps |
| **OS** | Ubuntu 22.04 | Ubuntu 24.04 | Ubuntu 24.04 LTS |

### Latency Targets by Hardware

| Configuration | STT | LLM | TTS | Total/Turn | Concurrent Calls |
|--------------|-----|-----|-----|-----------|-----------------|
| CPU-only (8 cores) | 500ms | 1500ms | 200ms | ~4.5s | 1-2 |
| RTX 3060 (12GB) | 100ms | 200ms | 100ms | ~2.6s | 3-5 |
| RTX 4090 (24GB) | 50ms | 100ms | 80ms | ~2.1s | 5-10 |

---

## Phase 1: Ubuntu Server Setup

### 1.1 Base Installation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y \
  curl wget git gnupg lsb-release \
  build-essential software-properties-common \
  ffmpeg netcat-openbsd \
  htop iotop nvtop \
  ufw fail2ban

# Set timezone
sudo timedatectl set-timezone UTC

# Verify Python 3.12+
python3 --version
```

### 1.2 Firewall Configuration

```bash
# Allow SSH, backend API, SIP, and RTP
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 8000/tcp      # Backend API
sudo ufw allow 5060/udp      # FreeSWITCH SIP
sudo ufw allow 8021/tcp      # FreeSWITCH ESL
sudo ufw allow 16384:32768/udp  # RTP media

# Enable firewall
sudo ufw --force enable
sudo ufw status verbose
```

### 1.3 Security Hardening

```bash
# Create dedicated user
sudo useradd -m -s /bin/bash ai-agent
sudo passwd ai-agent

# Disable root SSH login
sudo sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Set up swap (if RAM < 16GB)
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Phase 2: Python Setup

### 2.1 Python Environment

```bash
# Install Python 3.12
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.12 python3.12-venv python3.12-dev

# Verify
python3.12 --version

# Clone the project
git clone <your-repo-url> /opt/ai-sales-agent
cd /opt/ai-sales-agent
```

### 2.2 Virtual Environment

```bash
# Create venv
python3.12 -m venv /opt/ai-sales-agent/backend/venv

# Activate and install dependencies
source /opt/ai-sales-agent/backend/venv/bin/activate
pip install --upgrade pip
pip install -r /opt/ai-sales-agent/backend/requirements.txt

# Install PyTorch (CPU version)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Verify
python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')"
python -c "import faster_whisper; print(f'Whisper: {faster_whisper.__version__}')"
python -c "import kokoro; print(f'Kokoro: OK')"
```

### 2.3 GPU PyTorch (Optional — If NVIDIA GPU present)

```bash
# Verify CUDA is available
nvidia-smi

# Install PyTorch with CUDA
source /opt/ai-sales-agent/backend/venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu124

# Verify GPU
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"CPU\"}')"
```

---

## Phase 3: Redis Setup

### 3.1 Install Redis

```bash
# Option A: From apt (simplest)
sudo apt install -y redis-server

# Option B: From source (latest)
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt update
sudo apt install -y redis-server
```

### 3.2 Configure Redis

```bash
# Edit Redis config
sudo tee -a /etc/redis/redis.conf > /dev/null <<'EOF'

# AI Sales Agent Settings
appendonly yes
maxmemory 512mb
maxmemory-policy allkeys-lru
bind 127.0.0.1
port 6379
EOF

# Restart Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping
# Expected: PONG
```

### 3.3 Environment Variable

```ini
# In .env or .env.native
REDIS_URL=redis://127.0.0.1:6379
REDIS_HOST=127.0.0.1
```

---

## Phase 4: Ollama Setup

### 4.1 Install Ollama

```bash
# Automatic install
curl -fsSL https://ollama.com/install.sh | sh

# Verify
ollama --version
```

### 4.2 Configure Ollama

```bash
# Edit Ollama service configuration
sudo mkdir -p /etc/systemd/system/ollama.service.d/
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_KEEP_ALIVE=5m"
Environment="OLLAMA_NUM_PARALLEL=2"
EOF

# GPU acceleration (if NVIDIA)
sudo tee -a /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
Environment="OLLAMA_GPU_LAYERS=-1"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### 4.3 Download Model

```bash
# Pull default model (lightweight, CPU-friendly)
ollama pull qwen2.5:1.5b

# For GPU (better quality)
ollama pull qwen2.5:7b

# Verify
curl http://127.0.0.1:11434/api/tags
```

### 4.4 Test LLM

```bash
curl -X POST http://127.0.0.1:11434/api/generate \
  -d '{"model": "qwen2.5:1.5b", "prompt": "Hello! Say hello back in one sentence.", "stream": false}'
```

### 4.5 Environment Variable

```ini
# In .env or .env.native
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_HOST=127.0.0.1
OLLAMA_MODEL=qwen2.5:1.5b
```

---

## Phase 5: FreeSWITCH Setup

### 5.1 Install FreeSWITCH

> **IMPORTANT:** As of 2026, FreeSWITCH requires a **SignalWire account** and **Personal Access Token (PAT)** for apt repository access.
> The old unauthenticated `files.freeswitch.org` repo has been deprecated.
> Sign up at https://signalwire.com (free community tier available).

#### Option A: From SignalWire APT Repository (Recommended)

```bash
# 1. Sign up at https://signalwire.com and create a Personal Access Token (PAT)
# 2. Set your token (replace <YOUR_TOKEN>)
TOKEN=<YOUR_TOKEN>

# 3. Add repository GPG key
curl --http1.1 -fsSL https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/signalwire-freeswitch-repo.gpg

# 4. Create authentication file
echo "machine freeswitch.signalwire.com login signalwire password $TOKEN" \
  | sudo tee /etc/apt/auth.conf.d/freeswitch.conf
sudo chmod 600 /etc/apt/auth.conf.d/freeswitch.conf

# 5. Add repository
echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] \
  https://freeswitch.signalwire.com/repo/deb/debian-release/ bookworm main" \
  | sudo tee /etc/apt/sources.list.d/freeswitch.list

# 6. Install
sudo apt update
sudo apt install -y freeswitch-meta-all
```

#### Option B: From Source (No Account Needed)

```bash
cd /usr/local/src
sudo git clone --depth 1 --branch v1.10.12 https://github.com/signalwire/freeswitch.git /usr/local/src/freeswitch
cd /usr/local/src/freeswitch
sudo ./bootstrap.sh -j
sudo ./configure
sudo make -j$(nproc)
sudo make install

# Build AI modules
sudo make -j$(nproc) mod_event_socket mod_sofia mod_dptools
sudo make install mod_event_socket mod_sofia mod_dptools
```

### 5.2 Configure FreeSWITCH for AI

```bash
# Stop FreeSWITCH if running
sudo systemctl stop freeswitch 2>/dev/null || true
sudo killall freeswitch 2>/dev/null || true

# Backup default config
sudo cp -r /usr/local/freeswitch/conf /usr/local/freeswitch/conf.backup

# Copy AI configuration files
# These should be in your project at telephony/configs/freeswitch/
PROJECT_DIR=/opt/ai-sales-agent
FS_CONF=/usr/local/freeswitch/conf

# Copy dialplan
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/dialplan/default.xml ${FS_CONF}/dialplan/

# Copy SIP profiles
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/sip_profiles/internal.xml ${FS_CONF}/sip_profiles/
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/sip_profiles/external.xml ${FS_CONF}/sip_profiles/

# Copy ESL config
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/event_socket.conf.xml ${FS_CONF}/autoload_configs/

# Copy directory entries (extensions)
sudo mkdir -p ${FS_CONF}/directory/default
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/directory/default/*.xml ${FS_CONF}/directory/default/

# Copy vars
sudo cp ${PROJECT_DIR}/telephony/configs/freeswitch/vars.xml ${FS_CONF}/

# Create audio directory
sudo mkdir -p /tmp/fs_audio
sudo chmod 777 /tmp/fs_audio
```

### 5.3 Configure ESL

```bash
# Ensure ESL binds to localhost for security
sudo sed -i 's/<param name="listen-ip" value="[^"]*"/<param name="listen-ip" value="127.0.0.1"/' \
  ${FS_CONF}/autoload_configs/event_socket.conf.xml

# Verify ESL config
grep -A5 "listen-ip" ${FS_CONF}/autoload_configs/event_socket.conf.xml
```

### 5.4 Start FreeSWITCH

```bash
# Start FreeSWITCH
sudo freeswitch -nc -nonat

# Or use systemd (if service installed)
sudo systemctl start freeswitch

# Verify
fs_cli -x "status"
```

### 5.5 Verify ESL Connection

```bash
# Test ESL with Python
python3 -c "
import asyncio

class TestESL:
    async def test(self):
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection('127.0.0.1', 8021), timeout=5
        )
        # Read greeting
        data = await reader.read(4096)
        print('Greeting:', data.decode()[:100])
        # Authenticate
        writer.write(b'auth ClueCon\\n\\n')
        await writer.drain()
        data = await reader.read(4096)
        print('Auth:', data.decode()[:100])
        writer.close()
        print('ESL Test: PASS')

asyncio.run(TestESL().test())
"
```

### 5.6 Verify Extensions

```bash
# Check that extensions are registered
fs_cli -x "show registrations"
fs_cli -x "sofia status profile internal"
```

### 5.7 Environment Variables

```ini
# In .env or .env.native
FREESWITCH_BRIDGE_ENABLED=true
FREESWITCH_ESL_HOST=127.0.0.1
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=ClueCon
FREESWITCH_AUDIO_DIR=/tmp/fs_audio
FREESWITCH_RECORD_TIMEOUT=30
FREESWITCH_MAX_CALL_DURATION=600
FREESWITCH_MAX_TURNS=50
FREESWITCH_LLM_TIMEOUT=15
```

---

## Phase 6: Backend Deployment

### 6.1 Configure Environment

```bash
cd /opt/ai-sales-agent

# Copy environment template
cp .env.example .env
# Or use the native deployment env file
cp .env.native .env

# Edit .env with your settings
# Key settings to verify:
vim .env
```

**Minimum `.env` for native deployment:**

```ini
# Backend
HOST=0.0.0.0
PORT=8000
APP_NAME=AI Sales Agent (Native)
DEBUG=false

# LLM
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b

# STT
STT_PROVIDER=whisper
WHISPER_MODEL_SIZE=tiny
WHISPER_DEVICE=auto

# TTS
TTS_PROVIDER=kokoro
DEFAULT_VOICE_ID=af_bella

# Redis
REDIS_URL=redis://127.0.0.1:6379

# FreeSWITCH
FREESWITCH_BRIDGE_ENABLED=true
FREESWITCH_ESL_HOST=127.0.0.1
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=ClueCon

# Audio Cache
AUDIO_CACHE_ENABLED=true
AUDIO_CACHE_WARM=true
```

### 6.2 Create systemd Service

```bash
sudo tee /etc/systemd/system/ai-sales-agent.service > /dev/null <<'SERVICE'
[Unit]
Description=AI Sales Agent Backend
After=network.target redis-server.service ollama.service freeswitch.service
Wants=redis-server.service ollama.service freeswitch.service

[Service]
Type=simple
User=ai-agent
Group=ai-agent
WorkingDirectory=/opt/ai-sales-agent/backend
EnvironmentFile=/opt/ai-sales-agent/.env
ExecStart=/opt/ai-sales-agent/backend/venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 --log-level info
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Resource limits for 5-10 concurrent calls
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
```

### 6.3 Start the Backend

```bash
# Enable on boot
sudo systemctl enable ai-sales-agent

# Start
sudo systemctl start ai-sales-agent

# Check status
sudo systemctl status ai-sales-agent

# Watch logs
journalctl -u ai-sales-agent -f
```

### 6.4 Verify Backend

```bash
# Health endpoint
curl http://127.0.0.1:8000/health

# Provider health
curl http://127.0.0.1:8000/health/stt
curl http://127.0.0.1:8000/health/llm
curl http://127.0.0.1:8000/health/tts

# API docs
# Open http://your-server-ip:8000/docs in a browser
```

---

## Phase 7: SIP Trunk Configuration

### 7.1 Choose a Provider

| Provider | Setup Time | Cost/min | Sales Call Required |
|----------|-----------|----------|-------------------|
| **Plivo** | 25 min | ₹0.60/min | No |
| Twilio | 30 min | ~$0.013/min | No |
| Telnyx | 30 min | ~$0.009/min | No |

**Recommended: Plivo** (fastest setup, no sales call, Indian market focus)

### 7.2 Plivo Setup

```bash
# 1. Sign up at https://console.plivo.com (5 min)
# 2. Buy a phone number ($1-2/month)
# 3. Create a Zentrunk credential list
# 4. Create an Outbound Trunk pointing to your server

# 5. Configure FreeSWITCH gateway
sudo tee -a /usr/local/freeswitch/conf/sip_profiles/external.xml > /dev/null <<'XML'
<gateway name="plivo">
  <param name="username" value="YOUR_PLIVO_SIP_USERNAME"/>
  <param name="password" value="YOUR_PLIVO_SIP_PASSWORD"/>
  <param name="proxy" value="sip.plivo.com"/>
  <param name="realm" value="sip.plivo.com"/>
  <param name="register" value="true"/>
  <param name="register-transport" value="udp"/>
  <param name="caller-id-in-from" value="true"/>
  <param name="extension" value="YOUR_PLIVO_PHONE_NUMBER"/>
</gateway>
XML

# 6. Restart FreeSWITCH
sudo fs_cli -x "sofia profile external restart reloadxml"

# 7. Check registration
sudo fs_cli -x "sofia status gateway plivo"
# Expected: plivo   REGED
```

### 7.3 Provider Termination Configuration

In the Plivo console (or your provider's dashboard):

1. Go to **Zentrunk → Outbound Trunks → Your Trunk**
2. Set **Termination URI** to: `sip:YOUR_SERVER_PUBLIC_IP:5060`
3. Enable **G.711 PCMU/PCMA** codecs
4. Link your purchased phone number to the trunk

### 7.4 Test the Call Flow

```bash
# Make a test call through the SIP trunk
fs_cli -x "originate sofia/gateway/plivo/YOUR_TEST_NUMBER &echo()"

# If you hear yourself, the SIP trunk is working
# Now test the AI pipeline:
fs_cli -x "originate sofia/gateway/plivo/YOUR_TEST_NUMBER &park()"
```

---

## Phase 8: Production Testing

### 8.1 Verify All Components

```bash
# Run the health check script
cd /opt/ai-sales-agent
./scripts/check_health.sh

# Expected output:
# ✅ PASS: Backend HTTP -> ok
# ✅ PASS: STT provider: ok
# ✅ PASS: LLM provider: ok
# ✅ PASS: TTS provider: ok
# ✅ PASS: Ollama API responding (models: qwen2.5:1.5b)
# ✅ PASS: Redis PONG
# ✅ PASS: FreeSWITCH ESL: UP
# ✅ PASS: SIP port 5060 is open
```

### 8.2 Load Testing

```bash
# Test with concurrent requests
# Install hey or ab for HTTP load testing
sudo apt install -y hey

# Test single endpoint
hey -n 100 -c 5 http://127.0.0.1:8000/health

# Expected: 100 requests, ~5-10ms avg latency
```

### 8.3 Concurrent Call Testing

For testing 5-10 concurrent calls, use the built-in test:

```bash
# Start the backend with FreeSWITCH bridge enabled
# Then run the E2E call test
cd /opt/ai-sales-agent
python telephony/scripts/e2e_call_test.py \
  --mode esl \
  --concurrent 5 \
  --turns 3
```

### 8.4 Monitoring

```bash
# Backend logs
journalctl -u ai-sales-agent -f --since "5 min ago"

# Ollama logs
journalctl -u ollama -f --since "5 min ago"

# FreeSWITCH logs
tail -f /usr/local/freeswitch/log/freeswitch.log

# System resources
htop
nvidia-smi -l 2  # GPU monitoring

# Health endpoint (machine-readable)
curl -s http://127.0.0.1:8000/health | python3 -m json.tool
```

### 8.5 Performance Validation

```bash
# Measure end-to-end latency
curl -X POST http://127.0.0.1:8000/voice/pipeline \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@test_audio.wav" \
  -F "language=en" \
  -o /dev/null -w "Total time: %{time_total}s\n"
```

### 8.6 Production Checklist

- [ ] All 5 services running (Redis, Ollama, FreeSWITCH, Backend)
- [ ] Firewall configured (ports 22, 8000, 5060, 8021, 16384-32768)
- [ ] `.env` configured with correct values
- [ ] SIP trunk registered (REGED status)
- [ ] Backend health endpoint returns 200
- [ ] ESL bridge connected
- [ ] Audio directory writable
- [ ] GPU acceleration verified (if applicable)
- [ ] systemd services enabled on boot
- [ ] Log rotation configured

### 8.7 Troubleshooting Quick Reference

| Symptom | Check | Fix |
|---------|-------|-----|
| Backend won't start | `journalctl -u ai-sales-agent -n 50` | Check .env, venv, dependencies |
| Ollama not responding | `curl 127.0.0.1:11434/api/tags` | Restart: `systemctl restart ollama` |
| ESL connection refused | `nc -z 127.0.0.1 8021` | Start FreeSWITCH: `freeswitch -nc` |
| No audio in calls | `fs_cli -x "show codecs"` | Check RTP ports, codec support |
| High latency | `nvidia-smi` | Verify GPU utilization |
| SIP registration fails | `fs_cli -x "sofia status"` | Check credentials, firewall |
| Redis not available | `redis-cli ping` | Start: `systemctl start redis-server` |

---

## Quick Start (All Steps Combined)

```bash
# One-line deployment using the helper scripts:
sudo ./scripts/install_dependencies.sh --gpu    # Install everything (takes 20-40 min)
sudo ./scripts/deploy_native.sh                 # Deploy configs and services
sudo ./scripts/start_services.sh                # Start all services
./scripts/check_health.sh                       # Verify everything

# Now configure your SIP trunk (see Phase 7)
# Then make your first call!
```
