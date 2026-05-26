# OVHcloud GPU Deployment Guide

Deploy VoiceAI Orchestrator on OVHcloud GPU instances (e.g., **GPU-accelerated** series).

## Prerequisites

- OVHcloud account with GPU instance (H-GPU or T-series)
- SSH access to the instance
- Docker & Docker Compose installed
- `nvidia-container-toolkit` configured (see [docs/GPU_SETUP.md](./GPU_SETUP.md))

## Step 1: Provision a GPU Instance

Create an instance via OVHcloud Control Panel or API:

- **Category:** GPU
- **Model:** H-GPU-2 (2× A100 80GB) or T1-90 (1× A100 80GB)
- **OS:** Ubuntu 24.04 LTS
- **Region:** Choose closest to your callers (e.g., GRA for Europe, BHS for Americas)
- **Network:** 500 Mbps+ guaranteed

### Via OpenStack CLI

```bash
# Install OpenStack client
pip install openstackclient

# Source your openrc.sh
source openrc.sh

# Boot the instance
openstack server create \
  --flavor h-gpu-2 \
  --image Ubuntu-24.04 \
  --key-name your-key \
  --network public \
  voiceai-gpu

# Assign a floating IP
openstack floating ip create public
openstack server add floating ip voiceai-gpu <FLOATING_IP>
```

## Step 2: Install Dependencies

```bash
ssh ubuntu@<floating-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install nvidia-container-toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

## Step 3: Clone & Configure

```bash
git clone https://github.com/your-org/voiceai-orchestrator.git
cd voiceai-orchestrator

cp .env.example .env
nano .env
```

### Recommended `.env` for OVHcloud GPU (H-GPU-2)

```env
# ── GPU ──
TORCH_DEVICE=cuda
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_MODEL_SIZE=large-v3
XTTS_DEVICE=cuda
EMBEDDING_DEVICE=cuda

# ── Providers ──
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro

# ── LiveKit ──
LIVEKIT_ENABLED=true
LIVEKIT_SERVER_URL=ws://voiceai-livekit:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# ── SIP ──
SIP_ENABLED=true
SIP_SERVER_ADDRESS=0.0.0.0
```

## Step 4: Start Services

```bash
# Start with GPU profile
docker compose --profile gpu up -d --build

# Verify
docker compose ps
docker compose exec voiceai-api-gpu nvidia-smi
```

## Step 5: Network & Security

Configure OVHcloud security groups to allow traffic on ports:
- **8000** — API
- **7880-7881** — LiveKit
- **5060/udp** — SIP

OVHcloud uses **Network Security Groups** (NSG) — attach to your instance subnet:

```bash
# Using OpenStack CLI
openstack security group create voiceai-api
openstack security group rule create --protocol tcp --dst-port 8000 --remote-ip 0.0.0.0/0 voiceai-api
openstack security group rule create --protocol tcp --dst-port 7880:7881 --remote-ip your-trusted-cidr voiceai-api
openstack security group rule create --protocol udp --dst-port 5060 --remote-ip your-sip-provider-ips voiceai-api
```

## Step 6: Setup Reverse Proxy

See [Hetzner guide](./DEPLOY_HETZNER.md#step-6-setup-reverse-proxy-caddy) for Caddy setup instructions (same steps apply).

## Step 7: Persistent Storage

OVHcloud instances have ephemeral root disks. Attach a **Block Storage** volume:

```bash
# Create and attach volume
openstack volume create --size 200 voiceai-data
openstack server add volume voiceai-gpu voiceai-data

# Format and mount
sudo mkfs.ext4 /dev/vdb
sudo mkdir -p /mnt/voiceai-data
sudo mount /dev/vdb /mnt/voiceai-data

# Mount at boot
echo '/dev/vdb /mnt/voiceai-data ext4 defaults 0 0' | sudo tee -a /etc/fstab

# Symlink model/data directories
sudo ln -s /mnt/voiceai-data/chroma_data /home/ubuntu/voiceai-orchestrator/chroma_data
sudo ln -s /mnt/voiceai-data/audio /home/ubuntu/voiceai-orchestrator/audio
```

## Performance Tuning

OVHcloud H-GPU instances use **NVLink** between A100s for high-bandwidth GPU communication:

```bash
# Verify NVLink topology
nvidia-smi topo -m

# Enable NCCL optimizations
echo "NCCL_DEBUG=INFO" >> .env
echo "NCCL_IB_DISABLE=0" >> .env
```

## Pricing Estimate (H-GPU-2)

| Component   | Monthly Cost |
|-------------|-------------|
| GPU Instance| ~€1,200     |
| Block Storage 200GB | ~€20 |
| Bandwidth   | ~€50        |
| **Total**   | **~€1,270/mo** |

## Monitoring

```bash
# OVHcloud metrics via OpenStack
openstack metric list

# Container-level monitoring
docker stats

# Application health
curl http://localhost:8000/health
```

## Known Issues

- **A100 MIG (Multi-Instance GPU):** Disabled by default. Enable via `nvidia-smi mig -cgi` if you need GPU partitioning.
- **NVLink:** Only available on H-GPU models; T-series has PCIe only.
- **Bandwidth:** Ensure your SIP trunk or WebSocket connections are within OVHcloud's 500 Mbps–1 Gbps limit.
