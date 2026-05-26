# GPU Setup Guide — VoiceAI Orchestrator

> **Goal:** Enable CUDA-accelerated inference for Whisper (STT), XTTS (TTS), sentence embeddings (RAG), and Ollama (LLM).

---

## Prerequisites

### Required

| Component | Version | Check Command |
|-----------|---------|---------------|
| NVIDIA Driver | ≥ 525.60.11 (Linux) | `nvidia-smi` |
| Docker | ≥ 24.0 | `docker --version` |
| nvidia-container-toolkit | ≥ 1.14 | `nvidia-ctk --version` |

### Recommended GPU Specs

| Workload | Minimum VRAM | Recommended VRAM | GPU Examples |
|----------|-------------|------------------|--------------|
| Whisper (base) | 1 GB | 2 GB | T4, RTX 3060 |
| Whisper (large-v3) | 4 GB | 8 GB | RTX 4090, A10G |
| Ollama (qwen2.5:7b) | 6 GB | 8 GB | RTX 4090, A10G, A100 |
| Ollama (qwen2.5:32b) | 20 GB | 24 GB | A100, 2× RTX 4090 |
| XTTS-v2 | 2 GB | 4 GB | T4, RTX 3060 |
| Embeddings (all-MiniLM) | 512 MB | 1 GB | Any GPU |

---

## 1. Install nvidia-container-toolkit

### Ubuntu / Debian

```bash
# Add the NVIDIA Container Toolkit repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### RHEL / Fedora / CentOS

```bash
curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
  sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo

sudo yum install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Verify Installation

```bash
# Check nvidia-smi works inside Docker
sudo docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi

# Expected output:
# +-----------------------------------------------------------------------------+
# | NVIDIA-SMI 525.xx.xx   Driver Version: 525.xx.xx   CUDA Version: 12.4     |
# +-----------------------------------------------------------------------------+
```

---

## 2. Launch with GPU Acceleration

### Option A: GPU Profile (Recommended)

The `gpu` profile activates all GPU-enabled service variants:

```bash
# Build GPU-enabled images
docker compose --profile gpu build

# Start all services with GPU acceleration
docker compose --profile gpu up -d

# Verify GPU is being used
docker compose --profile gpu logs voiceai-api-gpu | grep -i "gpu\|cuda"
```

This starts:
- `voiceai-api-gpu` — API with CUDA Whisper + Embeddings
- `voiceai-worker-gpu` — Worker with CUDA Whisper + TTS
- `ollama` — LLM with GPU inference (automatically uses CUDA)

### Option B: Custom GPU Mapping

For fine-grained control over which GPUs are visible:

```bash
# Use only GPU 0
CUDA_VISIBLE_DEVICES=0 docker compose --profile gpu up -d

# Use specific GPUs
CUDA_VISIBLE_DEVICES=0,1 docker compose --profile gpu up -d

# Memory-constrained: limit GPU memory per process
# Set in .env:
# CUDA_VISIBLE_DEVICES=0
```

### Option C: CPU Fallback (Default)

Run without GPU (default — works on any machine):

```bash
docker compose up -d
```

---

## 3. Verify GPU Acceleration

### Check Whisper Device

```bash
curl -s http://localhost:8000/runtime/providers | python -m json.tool
# Look for active.stt — should show whisper on cuda
```

### Check Ollama GPU Usage

```bash
docker compose --profile gpu logs ollama | grep -i "cuda\|gpu"
```

### Check Runtime Status Endpoint

```bash
curl -s http://localhost:8000/runtime/status | python -m json.tool
# Expected: providers.active = whisper/ollama/kokoro
# providers.registered includes device info
```

### Monitor GPU Utilization

```bash
# Real-time GPU usage
watch -n 1 nvidia-smi

# Per-process GPU stats
nvidia-smi pmon -s p -d 5
```

---

## 4. Provider-Specific GPU Configuration

### Whisper (faster-whisper)

| Env Variable | CPU Default | GPU Recommended | Description |
|-------------|-------------|-----------------|-------------|
| `WHISPER_DEVICE` | `cpu` | `cuda` | Inference device |
| `WHISPER_COMPUTE_TYPE` | `int8` | `float16` | Precision (GPU: float16, CPU: int8) |
| `WHISPER_MODEL_SIZE` | `base` | `base` or `small` | Model size (larger = better, more VRAM) |

GPU-accelerated Whisper can transcribe **~30x faster** than CPU.

### Ollama

Ollama automatically detects and uses NVIDIA GPUs when available. No special config needed.

```bash
# Check which models are using GPU
ollama ps
```

For multi-GPU setups, Ollama can split models across GPUs:

```bash
# Set in .env
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
```

### XTTS (Coqui TTS)

| Env Variable | CPU Default | GPU Recommended | Description |
|-------------|-------------|-----------------|-------------|
| `XTTS_DEVICE` | `cpu` | `cuda` | Inference device |

GPU-accelerated XTTS synthesizes **~5-10x faster** than CPU.

### Embeddings (Sentence Transformers)

| Env Variable | CPU Default | GPU Recommended | Description |
|-------------|-------------|-----------------|-------------|
| `EMBEDDING_DEVICE` | `cpu` | `cuda` | Inference device |

---

## 5. Performance Tuning

### Memory Management

```bash
# Limit GPU memory per container (in docker-compose.yml)
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
          # Optional: limit to specific GPU IDs
          # device_ids: ['0', '1']
```

### Batch Processing

For batch transcription/embedding workloads:

```bash
# Increase Whisper workers
WHISPER_CPU_THREADS=8  # Not used for GPU, but keep reasonable

# Increase async worker pool
# Set in app/config.py or env:
# MAX_WORKERS=4
```

### Concurrent Calls

Each concurrent voice call uses approximately:
- Whisper: ~500 MB VRAM (base), ~2 GB VRAM (large-v3)
- XTTS: ~2 GB VRAM
- Embeddings: ~256 MB VRAM
- Ollama: ~6 GB VRAM (7B model), ~20 GB VRAM (32B model)

**Rule of thumb:** For 2 concurrent calls with Qwen 2.5 7B → need ≥ 16 GB VRAM total.

---

## 6. Troubleshooting

### "Could not select device driver "nvidia" with capabilities: [[gpu]]"

**Cause:** nvidia-container-toolkit not installed or Docker runtime not configured.

**Fix:**
```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### "CUDA error: out of memory"

**Cause:** Not enough VRAM for the selected models.

**Fix:**
```bash
# Use smaller Whisper model
WHISPER_MODEL_SIZE=tiny

# Use smaller Ollama model
OLLAMA_MODEL=qwen2.5:3b

# Limit GPU visibility to one card
CUDA_VISIBLE_DEVICES=0
```

### "nvidia-smi: command not found"

**Cause:** NVIDIA driver not installed on host.

**Fix:** Install NVIDIA drivers for your GPU:
```bash
# Ubuntu
sudo apt install nvidia-driver-550
sudo reboot
```

### "Whisper still running on CPU even with WHISPER_DEVICE=cuda"

**Cause:** PyTorch CUDA not available (CPU-only build).

**Fix:** Rebuild with GPU target:
```bash
docker compose --profile gpu build --no-cache
```

### Check CUDA Availability Inside Container

```bash
docker compose --profile gpu exec voiceai-api-gpu python -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
print(f'CUDA devices: {torch.cuda.device_count()}')
if torch.cuda.is_available():
    for i in range(torch.cuda.device_count()):
        print(f'  [{i}] {torch.cuda.get_device_name(i)}')
"
```

---

## 7. GPU Support Matrix

| Feature | CPU | Single GPU | Multi-GPU | Notes |
|---------|-----|------------|-----------|-------|
| Whisper STT | ✅ | ✅ | ⬜ (manual sharding) | GPU gives ~30x speedup |
| Ollama LLM | ✅ | ✅ | ✅ (model parallel) | Auto-detects CUDA |
| XTTS TTS | ✅ | ✅ | ⬜ | GPU gives ~5-10x speedup |
| Kokoro TTS | ✅ | ⬜ | ⬜ | Kokoro is CPU-optimized (~82M params) |
| Embeddings | ✅ | ✅ | ⬜ | Sentence-transformers |
| LiveKit | ✅ | ⬜ | ⬜ | WebRTC, no GPU needed |

---

## Quick Reference

```bash
# BUILD with GPU support
docker compose --profile gpu build --build-arg TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124

# START with GPU
docker compose --profile gpu up -d

# MONITOR GPU usage
watch -n 1 nvidia-smi

# CHECK GPU is working inside containers
docker compose --profile gpu exec voiceai-api-gpu python -c "import torch; print(torch.cuda.is_available())"

# STOP GPU services
docker compose --profile gpu down

# CPU MODE (no GPU needed)
docker compose up -d
```
