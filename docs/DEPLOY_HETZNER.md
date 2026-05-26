# Hetzner Cloud GPU Deployment Guide

Deploy VoiceAI Orchestrator on Hetzner Cloud GPU instances (e.g., **CX/AX series with GPU** or **dedicated GPU servers**).

## Prerequisites

- Hetzner Cloud account with GPU-capable instance (e.g., `GEX44` with NVIDIA A100)
- SSH access to the instance
- Docker & Docker Compose installed
- `nvidia-container-toolkit` configured (see [docs/GPU_SETUP.md](./GPU_SETUP.md))

## Step 1: Provision a GPU Instance

```bash
# Using hcloud CLI
hcloud server create \
  --name voiceai-gpu \
  --type gex44 \
  --image ubuntu-24.04 \
  --ssh-key your-key
```

Or use the Hetzner Cloud Console to create a server with:
- **Type:** GEX44 (A100 80GB) or higher
- **Image:** Ubuntu 24.04 LTS
- **Volume:** 100GB+ (models + audio data)

## Step 2: Install Dependencies

```bash
ssh root@<server-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install nvidia-container-toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt-get update && apt-get install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# Verify GPU
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

## Step 3: Clone & Configure

```bash
git clone https://github.com/your-org/voiceai-orchestrator.git
cd voiceai-orchestrator

# Copy and edit environment
cp .env.example .env
# Edit .env — set HOST to 0.0.0.0, configure API keys
nano .env
```

### Recommended `.env` for Hetzner GPU

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

# ── LiveKit (for real-time voice) ──
LIVEKIT_ENABLED=true
LIVEKIT_SERVER_URL=ws://voiceai-livekit:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# ── SIP ──
SIP_ENABLED=true
SIP_SERVER_ADDRESS=0.0.0.0
SIP_PORT=5060
```

## Step 4: Start with GPU Profile

```bash
# Build and start with GPU support
docker compose --profile gpu up -d --build

# Verify all services are running
docker compose ps

# Check GPU is being used by the API container
docker compose exec voiceai-api-gpu nvidia-smi
```

## Step 5: Configure Firewall

Allow inbound traffic to:
- **8000** — VoiceAI API (Caddy/NGINX reverse proxy recommended)
- **7880** — LiveKit WebSocket (if needed externally)
- **7881** — LiveKit HTTP API
- **5060** — SIP trunk (if using phone integration)

```bash
# Using Hetzner firewall
hcloud firewall create --name voiceai
hcloud firewall add-rule --firewall voiceai --direction in --protocol tcp --port 8000 --source-ips 0.0.0.0/0
hcloud firewall add-rule --firewall voiceai --direction in --protocol tcp --port 7880 --source-ips your-trusted-ips
hcloud firewall add-rule --firewall voiceai --direction in --protocol udp --port 5060 --source-ips your-sip-provider-ips
hcloud firewall apply --firewall voiceai --server voiceai-gpu
```

## Step 6: Setup Reverse Proxy (Caddy)

```bash
# Install Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install caddy
```

Create `/etc/caddy/Caddyfile`:

```caddy
api.voiceai.yourdomain.com {
    reverse_proxy localhost:8000
}

livekit.voiceai.yourdomain.com {
    reverse_proxy localhost:7880
}
```

## Performance Notes

| GPU Model   | VRAM   | Whisper Model | Batch Size | Concurrent Calls |
|-------------|--------|---------------|------------|------------------|
| A100 80GB   | 80 GB  | large-v3      | 8          | 10–20            |
| A100 40GB   | 40 GB  | large-v3      | 4          | 5–10             |
| A10 24GB    | 24 GB  | medium        | 2          | 3–5              |
| L4 24GB     | 24 GB  | medium        | 2          | 3–5              |
| T4 16GB     | 16 GB  | small         | 1          | 2–3              |
| L40S 48GB   | 48 GB  | large-v3      | 4          | 5–10             |

## Monitoring

```bash
# GPU usage
watch -n 1 nvidia-smi

# Container logs
docker compose logs -f voiceai-api-gpu

# Application health
curl http://localhost:8000/health
```

## Troubleshooting

| Problem                          | Solution                                          |
|----------------------------------|---------------------------------------------------|
| Container crashes with CUDA error | Ensure `nvidia-container-toolkit` is installed and `docker restart` was run |
| Ollama not loading models        | Ensure OLLAMA_MODEL is set correctly. First run may take 5–10 min to pull. |
| SIP calls failing                | Check firewall allows UDP 5060. Verify SIP trunk credentials in `.env`. |
| TTS voice sounds robotic         | Set `WHISPER_COMPUTE_TYPE=float16` for better quality on GPU. |
