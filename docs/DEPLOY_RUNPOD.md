# RunPod Serverless GPU Deployment Guide

Deploy VoiceAI Orchestrator on **RunPod** — ideal for burst/on-demand inference with GPU-backed serverless pods.

## Prerequisites

- RunPod account
- Docker & ability to push to a container registry (Docker Hub / GitHub Container Registry)
- `nvidia-container-toolkit` for local testing

## Why RunPod?

RunPod is cost-effective for:
- **Burst workloads** — pay per second only when processing calls
- **GPU-enabled test environments** — $0.34–$2.19/hr for A100–H100
- **Global regions** — deploy close to callers (US, EU, Asia)
- **Serverless mode** — auto-scales to zero when idle

## Option A: Serverless Endpoint (Recommended)

Deploy the VoiceAI API as a RunPod serverless endpoint with GPU worker pods.

### Step 1: Build & Push the Container

```bash
# Build the GPU-optimized image
docker build --target gpu-runtime -t voiceai-orchestrator:latest .

# Tag and push to your registry
docker tag voiceai-orchestrator:latest ghcr.io/your-org/voiceai-orchestrator:latest
docker push ghcr.io/your-org/voiceai-orchestrator:latest
```

### Step 2: Create a RunPod Serverless Endpoint

Via **RunPod Console** → **Serverless** → **Create Endpoint**:

| Setting                | Value                                      |
|------------------------|--------------------------------------------|
| Image                  | `ghcr.io/your-org/voiceai-orchestrator`   |
| GPU Type               | NVIDIA A100 80GB                           |
| Container Port         | 8000                                       |
| Min Workers            | 0 (scale to zero)                          |
| Max Workers            | 5                                          |
| Idle Timeout           | 30 seconds                                 |
| Starter Command        | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| Environment Variables  | See config below                           |

### Environment Variables

```env
TORCH_DEVICE=cuda
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
WHISPER_MODEL_SIZE=large-v3
XTTS_DEVICE=cuda
EMBEDDING_DEVICE=cuda
STT_PROVIDER=whisper
LLM_PROVIDER=ollama
TTS_PROVIDER=kokoro
LIVEKIT_ENABLED=false
SIP_ENABLED=false
ENFORCE_SUBSCRIPTIONS=false
```

### Step 3: Connect from Dashboard

```ts
// dashboard/src/lib/api.ts
const RUNPOD_ENDPOINT = "https://api.runpod.ai/v2/your-endpoint-id";

export async function proxyToRunpod(body: any) {
  const res = await fetch(`${RUNPOD_ENDPOINT}/runsync`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RUNPOD_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: body,
    }),
  });
  return res.json();
}
```

## Option B: Pod Deployment

For longer-running sessions or development:

### Step 1: Create a Pod

Via **RunPod Console** → **Pods** → **Deploy Pod**:

| Setting           | Value                                    |
|-------------------|------------------------------------------|
| Template          | Custom Container                          |
| Image             | `ghcr.io/your-org/voiceai-orchestrator` |
| GPU Type          | NVIDIA A100 80GB                         |
| Container Disk    | 100 GB                                    |
| Volume Mount      | `/workspace/voiceai`                      |
| Expose HTTP Port  | 8000                                      |
| Startup Command   | `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` |

### Step 2: Add Environment Variables

Add the same environment variables as the serverless config above.

### Step 3: Connect

RunPod provides a direct HTTPS URL: `https://your-pod-id-8000.proxy.runpod.net`

```bash
curl https://your-pod-id-8000.proxy.runpod.net/health
```

## Performance on RunPod

| GPU Type   | Cost/hr | Whisper | TTS Latency | Concurrent Calls |
|------------|---------|---------|-------------|------------------|
| A100 80GB  | $1.91   | large-v3 (~200ms) | Kokoro instant | 10–20 |
| A100 40GB  | $0.79   | large-v3 (~300ms) | Kokoro instant | 5–10  |
| A6000 48GB | $0.57   | medium (~250ms)   | Kokoro instant | 3–5   |
| RTX 4090   | $0.34   | medium (~350ms)   | Kokoro instant | 2–3   |
| L40S 48GB  | $0.72   | large-v3 (~250ms) | Kokoro instant | 5–10  |

## Cold Start Optimization

RunPod serverless endpoints have a cold start of 15–30 seconds (container pull + model load).

To mitigate:

1. **Keep 1 always-on worker:** Set `Min Workers: 1` for production (costs ~$1.91/hr for A100)
2. **Pre-pull models:** Add a startup script to download Whisper/BERT models:

```dockerfile
# In Dockerfile
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

3. **Use the `--warmup` endpoint:** Call `/health` every 30s to keep the pod warm.

## Monitoring

RunPod provides built-in metrics:
- **GPU Utilization** — in RunPod Dashboard
- **Request Latency** — p50, p95, p99
- **Error Rate** — 4xx/5xx tracking
- **Cost Breakdown** — per-endpoint billing

```bash
# Via RunPod API
curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
  https://api.runpod.ai/v2/your-endpoint-id/metrics
```

## Limitations

- **No LiveKit/SIP:** RunPod pods don't support UDP or persistent WebSocket connections for LiveKit real-time voice. Use serverless only for REST-based TTS/STT.
- **No Ollama:** Ollama requires a separate pod. For LLM, use OpenAI/Gemini/OpenRouter API instead, or deploy a separate Ollama pod.
- **Ephemeral storage:** Models are re-downloaded on each cold start unless you use RunPod Network Volumes.

## Best Practices for Serverless Voice AI

1. **Use cloud LLM** (OpenAI, Gemini) instead of Ollama on RunPod to keep endpoints fast
2. **Pre-load models** in Dockerfile to reduce cold start time
3. **Set sensible timeouts** — voice processing should complete within 30s
4. **Batch transcription requests** when possible (RunPod charges per second)
