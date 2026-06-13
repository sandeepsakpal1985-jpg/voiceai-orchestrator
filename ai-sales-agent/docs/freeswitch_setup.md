# FreeSWITCH Setup Guide

This guide covers setting up FreeSWITCH for integration with the AI Sales Agent across three environments: Windows, Docker, and Linux.

---

## Prerequisites

Before installing FreeSWITCH, ensure:

1. **Python 3.10+** is installed
2. **AI Backend** is running: `cd backend && python -m app.main`
3. **Ollama** is running with Qwen model: `ollama run qwen2.5:3b`
4. At least **4GB RAM** and **2 CPU cores** available
5. **Ports 5060 (SIP)** and **8021 (ESL)** are open

---

## Option 1: Docker Setup (Recommended)

Docker is the easiest way to get FreeSWITCH running with the AI agent.

### Step 1: Create Docker Compose file

Create `docker/freeswitch-docker-compose.yml`:

```yaml
version: "3.8"

services:
  freeswitch:
    image: signalwire/freeswitch:latest
    container_name: freeswitch-ai
    network_mode: host
    volumes:
      - ./freeswitch/conf:/etc/freeswitch
      - ./freeswitch/recordings:/tmp/fs_audio
      - ../telephony/configs/freeswitch/dialplan:/etc/freeswitch/dialplan/default
      - ../telephony/configs/freeswitch/sip_profiles:/etc/freeswitch/sip_profiles
    environment:
      - TZ=UTC
    cap_add:
      - NET_ADMIN
      - SYS_ADMIN
      - SYS_PTRACE
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  ai-backend:
    build: ../backend
    container_name: ai-backend
    network_mode: host
    environment:
      - FREESWITCH_BRIDGE_ENABLED=true
      - FREESWITCH_ESL_HOST=127.0.0.1
      - FREESWITCH_ESL_PASSWORD=ClueCon
      - STT_PROVIDER=${STT_PROVIDER:-whisper}
      - LLM_PROVIDER=${LLM_PROVIDER:-ollama}
      - TTS_PROVIDER=${TTS_PROVIDER:-kokoro}
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    volumes:
      - ../tmp_fs_audio:/tmp/fs_audio
    restart: unless-stopped
```

### Step 2: Start the services

```bash
docker compose -f docker/freeswitch-docker-compose.yml up -d
```

### Step 3: Verify

```bash
# Check FreeSWITCH status
docker exec freeswitch-ai fs_cli -x "status"

# Check AI backend
curl http://localhost:8000/health
```

---

## Option 2: Windows Setup

### Step 1: Install FreeSWITCH on Windows

1. Download the FreeSWITCH Windows installer from:
   https://files.freeswitch.org/windows/installer/

2. Run the installer (recommended: install to `C:\Program Files\FreeSwitch`)

3. Ensure the following modules are enabled in `C:\Program Files\FreeSwitch\conf\autoload_configs\modules.conf.xml`:
   ```xml
   <load module="mod_event_socket"/>
   <load module="mod_sofia"/>
   <load module="mod_dptools"/>
   ```

### Step 2: Configure Event Socket

Edit `C:\Program Files\FreeSwitch\conf\autoload_configs\event_socket.conf.xml`:

```xml
<configuration name="event_socket.conf" description="Socket Client">
  <settings>
    <param name="nat-map" value="false"/>
    <param name="listen-ip" value="127.0.0.1"/>
    <param name="listen-port" value="8021"/>
    <param name="password" value="ClueCon"/>
    <param name="apply-inbound-acl" value="loopback"/>
  </settings>
</configuration>
```

### Step 3: Copy AI Dialplan

Copy the AI dialplan files:

```powershell
# Create directories if needed
New-Item -ItemType Directory -Force -Path "C:\Program Files\FreeSwitch\conf\dialplan\ai_agent"

# Copy dialplan
Copy-Item "telephony\configs\freeswitch\dialplan\default.xml" `
  "C:\Program Files\FreeSwitch\conf\dialplan\ai_agent\ai_agent.xml"

# Copy SIP profile
Copy-Item "telephony\configs\freeswitch\sip_profiles\internal.xml" `
  "C:\Program Files\FreeSwitch\conf\sip_profiles\ai_internal.xml"
```

### Step 4: Enable AI Context in Dialplan

Edit `C:\Program Files\FreeSwitch\conf\dialplan\default.xml` to include:
```xml
<X-PRE-PROCESS cmd="include" data="ai_agent/*.xml"/>
```

### Step 5: Start FreeSWITCH

```powershell
# Start as a service
Start-Service -Name "FreeSwitch"

# Or start from command line
& "C:\Program Files\FreeSwitch\freeswitch.exe" -nonat -nc
```

### Step 6: Test ESL Connection

```bash
# Install telnet or use Python to test
python -c "
import socket
s = socket.socket()
s.connect(('127.0.0.1', 8021))
s.send(b'auth ClueCon\n\n')
print(s.recv(1024).decode())
s.close()
"
```

---

## Option 3: Linux Deployment

### Step 1: Install FreeSWITCH

#### Ubuntu/Debian
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y build-essential git automake autoconf libtool \
  libssl-dev libcurl4-openssl-dev libpcre3-dev libspeexdsp-dev \
  libldns-dev libedit-dev libtiff5-dev libopus-dev libpq-dev \
  libsqlite3-dev libsndfile1-dev

# Download and compile FreeSWITCH
cd /usr/local/src
sudo git clone https://github.com/signalwire/freeswitch.git freeswitch
cd freeswitch
sudo ./bootstrap.sh
sudo ./configure
sudo make
sudo make install
```

#### CentOS/RHEL
```bash
sudo yum install -y epel-release
sudo yum groupinstall -y "Development Tools"
sudo yum install -y curl-devel pcre-devel speexdsp-devel \
  ldns-devel libedit-devel tiff-devel opus-devel postgresql-devel \
  sqlite-devel libsndfile-devel

# Download and compile (same as Ubuntu steps above)
```

#### Quick install via packages
```bash
# FreeSWITCH official APT repository
wget -O - https://files.freeswitch.org/repo/deb/debian/freeswitch_archive_g0.pub | sudo apt-key add -
echo "deb http://files.freeswitch.org/repo/deb/freeswitch-1.10/ buster main" | sudo tee /etc/apt/sources.list.d/freeswitch.list
sudo apt update
sudo apt install -y freeswitch-meta-all
```

### Step 2: Configure FreeSWITCH

```bash
# Stop FreeSWITCH if running
sudo systemctl stop freeswitch

# Backup default config
sudo cp -r /etc/freeswitch /etc/freeswitch.backup

# Copy AI configuration files
sudo cp telephony/configs/freeswitch/dialplan/default.xml /etc/freeswitch/dialplan/ai_agent.xml
sudo cp telephony/configs/freeswitch/sip_profiles/internal.xml /etc/freeswitch/sip_profiles/ai_internal.xml

# Enable ESL
sudo sed -i 's/<param name="listen-ip" value="::">/<param name="listen-ip" value="127.0.0.1">/' /etc/freeswitch/autoload_configs/event_socket.conf.xml
```

### Step 3: Set up AI Backend Service

```bash
# Create systemd service for the AI backend
sudo tee /etc/systemd/system/ai-sales-agent.service << 'EOF'
[Unit]
Description=AI Sales Agent Backend
After=network.target freeswitch.service

[Service]
Type=simple
User=agent
WorkingDirectory=/opt/ai-sales-agent/backend
Environment=FREESWITCH_BRIDGE_ENABLED=true
Environment=FREESWITCH_ESL_HOST=127.0.0.1
Environment=FREESWITCH_ESL_PASSWORD=ClueCon
ExecStart=/usr/bin/python3 -m app.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-sales-agent
sudo systemctl start ai-sales-agent
```

### Step 4: Configure Audio Directory

```bash
sudo mkdir -p /tmp/fs_audio
sudo chmod 777 /tmp/fs_audio
```

### Step 5: Start Everything

```bash
# Start FreeSWITCH
sudo systemctl start freeswitch

# Start AI backend
sudo systemctl start ai-sales-agent

# Start Ollama (if local)
ollama serve &
ollama pull qwen2.5:3b
```

### Step 6: Verify

```bash
# Check FreeSWITCH
fs_cli -x "status"

# Check AI backend
curl http://localhost:8000/health

# Check FS bridge
curl http://localhost:8000/fs/health

# Test ESL connection from Python
python -c "
import asyncio
from telephony.freeswitch import ESLClient
async def test():
    c = ESLClient()
    await c.connect()
    print('ESL connected!')
    resp = await c.send_command('status')
    print('Status:', resp.body[:200])
    await c.disconnect()
asyncio.run(test())
"
```

---

## Testing the Integration

### Test 1: Simulate a Call (No FreeSWITCH needed)

```bash
cd /opt/ai-sales-agent
python telephony/scripts/simulate_call.py --mode direct
```

### Test 2: Test HTTP Mode (FreeSWITCH with curl dialplan)

```bash
python telephony/scripts/simulate_call.py --mode http
```

### Test 3: Test ESL Connection (FreeSWITCH required)

```bash
python telephony/scripts/simulate_call.py --mode esl
```

### Test 4: Full Integration Test

```bash
# Start everything in correct order
ollama serve &                    # LLM backend
cd backend && python -m app.main  # AI backend

# In another terminal
python telephony/scripts/simulate_call.py --mode all
```

### Making a Test Phone Call

Once FreeSWITCH is running and connected:

1. Register a SIP softphone (e.g., Zoiper, Linphone) with:
   - **Server**: your server IP
   - **Port**: 5060
   - **User**: any extension

2. Call any number — FreeSWITCH will route it to the AI agent

3. Or, from `fs_cli`:
   ```bash
   originate user/1000 &park()
   ```

---

## Troubleshooting

### ESL Connection Refused
```bash
# Check if ESL module is loaded
fs_cli -x "show modules" | grep event_socket

# Check ESL config
cat /etc/freeswitch/autoload_configs/event_socket.conf.xml

# Check if port is listening
netstat -an | grep 8021
```

### No Audio / One-Way Audio
```bash
# Check RTP ports are open
sudo iptables -L -n | grep 16384

# Check codec support
fs_cli -x "show codecs"

# Check audio file permissions
ls -la /tmp/fs_audio/
```

### Bridge Service Won't Connect
```bash
# Check logs
journalctl -u ai-sales-agent -f

# Check environment variables
echo $FREESWITCH_BRIDGE_ENABLED
echo $FREESWITCH_ESL_HOST
echo $FREESWITCH_ESL_PASSWORD

# Test ESL with Python directly
```

### FreeSWITCH Won't Start
```bash
# Check config validity
fs_cli -x "fsctl configcheck"

# Check logs
tail -f /var/log/freeswitch/freeswitch.log

# Common fix: missing modules
cd /usr/local/freeswitch/mod
ls -la mod_event_socket*
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `FREESWITCH_BRIDGE_ENABLED` | `false` | Enable FreeSWITCH bridge on startup |
| `FREESWITCH_ESL_HOST` | `127.0.0.1` | FreeSWITCH ESL server host |
| `FREESWITCH_ESL_PORT` | `8021` | FreeSWITCH ESL server port |
| `FREESWITCH_ESL_PASSWORD` | `ClueCon` | ESL authentication password |
| `FREESWITCH_ESL_TIMEOUT` | `10` | ESL connection timeout (seconds) |
| `FREESWITCH_AUDIO_DIR` | `tmp_fs_audio` | Directory for temp audio files |
| `FREESWITCH_RECORD_TIMEOUT` | `30` | Max recording duration per turn |
| `FREESWITCH_MAX_CALL_DURATION` | `600` | Max call duration (seconds) |
| `FREESWITCH_MAX_TURNS` | `50` | Max conversation turns per call |
| `FREESWITCH_GREETING` | `(default greeting)` | Initial greeting text |
| `FREESWITCH_LLM_TIMEOUT` | `15` | LLM response timeout (seconds) |
| `FREESWITCH_BRIDGE_RECONNECT_DELAY` | `5` | Delay between ESL reconnection attempts |
| `FREESWITCH_BRIDGE_MAX_RETRIES` | `10` | Max ESL reconnection attempts |
