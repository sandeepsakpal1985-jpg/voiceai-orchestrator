# Production Bottleneck Analysis

Analyzes CPU, RAM, Disk, Network, and GPU bottlenecks across the AI voice pipeline.
Provides expected latency estimates for different hardware configurations.

---

## Measurement Baseline

All measurements were taken on a **Windows 11, Intel i7-12700H, 32GB RAM, CPU-only** machine.

### Pipeline: Whisper tiny → Qwen 2.5:1.5b (Ollama) → Kokoro

| Stage | Cold Start | Warm | Bottleneck |
|-------|-----------|------|------------|
| STT (Whisper) | ~6,000ms | 200-500ms | CPU (model load) |
| LLM (Qwen 1.5b) | ~10,000ms | 400-1,500ms | CPU (inference) |
| TTS (Kokoro) | ~1,000ms | 100-300ms | CPU (minimal) |
| **Total** | **~17,000ms** | **700-2,300ms** | CPU |

---

## Component-Level Analysis

### 1. CPU

**Current Hardware:** Intel i7-12700H (14 cores, 20 threads, 2.3-4.7 GHz)

| Component | CPU Usage | Impact | Notes |
|-----------|-----------|--------|-------|
| Whisper STT (tiny) | 2-4 cores @ 100% | 🔴 High | Single transcription saturates cores |
| Ollama (1.5b model) | 4-6 cores @ 80-100% | 🔴 High | Prompt evaluation is CPU-bound |
| Kokoro TTS | 1-2 cores @ 30% | 🟢 Low | Efficient even on CPU |
| Backend (FastAPI) | 1-2 cores @ 5-10% | 🟢 Low | Async I/O, minimal CPU |
| FreeSWITCH | 1-2 cores @ 10-20% | 🟢 Low | Media processing, lightweight |

**Analysis:** CPU is the primary bottleneck for both Whisper and Ollama. Under load (multiple concurrent calls), CPU contention will significantly increase latency.

**Recommendation:** 
- Single call: CPU is acceptable (2-3s warm latency)
- 2+ concurrent calls: Will degrade to 5-10s+ per turn
- Production with >1 concurrent call: **GPU is required**

---

### 2. RAM

**Current Hardware:** 32GB DDR5

| Component | Memory Usage | Impact | Notes |
|-----------|-------------|--------|-------|
| Whisper (tiny) | ~500MB | 🟢 Low | Tiny model, small footprint |
| Ollama (1.5b model) | ~1.5-2GB | 🟡 Medium | Model loaded into RAM |
| Kokoro TTS | ~200MB | 🟢 Low | Minimal |
| Backend + Python | ~200-400MB | 🟢 Low | FastAPI + dependencies |
| FreeSWITCH | ~100-200MB | 🟢 Low | |
| **Total baseline** | **~2.5-3.3GB** | 🟢 Low | |

**Analysis:** 32GB is more than sufficient for all components. Even loading larger models (7B = ~6GB, 14B = ~12GB) would be fine. RAM is not a bottleneck.

**Recommendation:** 
- 8GB minimum for current stack (may swap under load)
- 16GB recommended for comfortable operation
- 32GB+ for large models (14B+)

---

### 3. Disk

**Current Hardware:** NVMe SSD (~3,500 MB/s sequential read)

| Component | Disk I/O | Impact | Notes |
|-----------|----------|--------|-------|
| Whisper model load | ~300MB read (one-time) | 🟢 Low | Fast SSD handles easily |
| Ollama model load | ~1GB read (one-time) | 🟢 Low | Fast SSD handles easily |
| WAV file I/O | ~50-100KB per turn | 🟢 Low | Negligible |
| Audio cache | ~30KB per cached phrase | 🟢 Low | Negligible |
| Logging | Minimal | 🟢 Low | |

**Analysis:** Disk is not a bottleneck. All model loading is one-time at startup. Per-turn audio I/O is tiny. An SSD is recommended but even HDD would work for the small file sizes.

**Recommendation:** 
- Any SSD is sufficient
- HDD acceptable but startup will be slower
- Ensure `data/audio/cache/` directory has sufficient space (estimate: ~100MB for full cache)

---

### 4. Network

| Component | Bandwidth | Latency | Notes |
|-----------|-----------|---------|-------|
| Ollama API (localhost) | ~1-5KB per request | <1ms | Local HTTP, negligible |
| FreeSWITCH ESL (localhost) | ~1-10KB per command | <1ms | Local TCP, negligible |
| SIP/RTP (external) | ~64-128Kbps per call | 10-50ms | Audio stream, codec-dependent |
| TTS audio delivery | ~30-100KB per response | Depends on network | WAV file to FreeSWITCH |
| Audio file transfer | ~50-100KB per turn | <1ms (local) | Local file system |

**Analysis:** Network is not a bottleneck for local operation. The only external network dependency is the SIP/RTP media path, which requires ~128Kbps per call for PCMU audio.

**Recommendation:** 
- For cloud deployment: 100Mbps+ internet connection
- For RTP: ensure low-latency path (<50ms) between FreeSWITCH and SIP provider
- For multi-call: 1Mbps supports ~8 simultaneous PCMU calls

---

### 5. GPU

**Current Status:** ❌ No GPU available on this machine

GPU acceleration is the single highest-impact optimization available.

| Component | GPU Model | Expected Latency | Speedup vs CPU |
|-----------|-----------|-----------------|----------------|
| **Whisper (tiny)** | | | |
| | RTX 3060 (12GB) | 50-150ms | 3-4x faster |
| | RTX 4060 (8GB) | 40-120ms | 4-5x faster |
| | RTX 4090 (24GB) | 20-60ms | 8-10x faster |
| | Cloud GPU (A10G) | 30-80ms | 5-7x faster |
| **Ollama (1.5b)** | | | |
| | RTX 3060 | 80-200ms | 5-8x faster |
| | RTX 4060 | 60-150ms | 7-10x faster |
| | RTX 4090 | 20-50ms | 10-20x faster |
| | Cloud GPU (A10G) | 30-80ms | 8-12x faster |
| **Ollama (7b)** | | | |
| | RTX 3060 (12GB) | 400-1200ms | 5x faster |
| | RTX 4060 (8GB) | ❌ VRAM insufficient | — |
| | RTX 4090 (24GB) | 100-300ms | 10-15x faster |
| | Cloud GPU (A10G) | 150-400ms | 8-10x faster |

---

## Expected Latency by Hardware Configuration

### Configuration A: CPU Only (Current)
```diff
! Recommended for: Development, testing, low-volume (<50 calls/day)
! Estimated cost: Existing hardware ($0 additional)
+ Estimated warm per-turn latency: 2-4 seconds
- Estimated cold start: 15-20 seconds
- Maximum concurrent calls: 1 (2 with degradation)
```

### Configuration B: Budget GPU (RTX 3060, ~$250)
```diff
+ Recommended for: Production, moderate volume (50-500 calls/day)
+ Estimated cost: ~$250-300 for GPU
+ Estimated warm per-turn latency: 500-800ms
+ Estimated cold start: 2-4 seconds
+ Maximum concurrent calls: 3-5
```

### Configuration C: Mid-Range GPU (RTX 4060, ~$300)
```diff
+ Recommended for: Production, moderate-high volume (100-1000 calls/day)
+ Estimated cost: ~$300-350 for GPU
+ Estimated warm per-turn latency: 400-600ms
+ Estimated cold start: 2-3 seconds
+ Maximum concurrent calls: 3-5
```

### Configuration D: High-End GPU (RTX 4090, ~$1600)
```diff
+ Recommended for: High-volume production (500-5000 calls/day)
+ Estimated cost: ~$1,600 for GPU
+ Estimated warm per-turn latency: 200-400ms
+ Estimated cold start: 1-2 seconds
+ Maximum concurrent calls: 5-10
+ Can run 7B+ models for better conversation quality
```

### Configuration E: Cloud GPU (A10G/A100, ~$1-3/hr)
```diff
+ Recommended for: Elastic scaling, variable load
+ Estimated cost: ~$720-2,160/month (24/7 operation)
+ Estimated warm per-turn latency: 200-500ms
+ Estimated cold start: 1-3 seconds
+ Maximum concurrent calls: 5-20 (scalable)
+ Best for: Production services with variable load
```

---

## Latency Breakdown by Configuration

### Configuration A (CPU Only, Current)
```
Recording (VAD):       2,000ms ████████████████████████████████████████
STT (Whisper tiny):      500ms ██████████
LLM (Qwen 1.5b):      1,500ms ██████████████████████████████████
TTS (Kokoro):            200ms ████
Overhead:                300ms ██████
────────────────────────────────────────────────────────
Total per turn:       4,500ms  (Acceptable)
```

### Configuration B (RTX 3060)
```
Recording (VAD):       2,000ms ██████████████████████████████████████████████████████
STT (Whisper tiny):      100ms ███
LLM (Qwen 1.5b):         200ms █████
TTS (Kokoro):            100ms ███
Overhead:                200ms █████
────────────────────────────────────────────────────────
Total per turn:       2,600ms  (Good)
```

### Configuration D (RTX 4090 with 7B model)
```
Recording (VAD):       1,500ms ████████████████████████████████████████████████████████████████
STT (Whisper small):      150ms ██████
LLM (Qwen 7b):            200ms ████████
TTS (Kokoro):              80ms ███
Overhead:                 200ms ████████
────────────────────────────────────────────────────────
Total per turn:       2,130ms  (Good — with better quality)
```

---

## Resource Usage Projections

### Single Call
| Resource | CPU Only | RTX 3060 | RTX 4090 |
|----------|----------|----------|----------|
| CPU Usage | 60-80% | 10-20% | 5-10% |
| RAM Usage | 3-4GB | 4-5GB | 6-8GB |
| GPU VRAM | — | 4-6GB | 8-12GB |
| Network | ~128Kbps | ~128Kbps | ~128Kbps |

### 5 Concurrent Calls
| Resource | CPU Only | RTX 3060 | RTX 4090 |
|----------|----------|----------|----------|
| CPU Usage | ❌ 300%+ | 30-50% | 20-30% |
| RAM Usage | ❌ 8GB+ | 6-8GB | 10-14GB |
| GPU VRAM | — | 6-8GB | 12-20GB |
| Network | ~640Kbps | ~640Kbps | ~640Kbps |

---

## Key Takeaways

1. **CPU is the bottleneck** — The current i7-12700H is sufficient for development but not production at any meaningful scale
2. **RAM is plentiful** — 32GB can handle even 14B models alongside all other components
3. **Disk I/O is not a concern** — SSD or even HDD works fine for this workload
4. **Network is only a factor for remote SIP trunks** — Local deployment has negligible network overhead
5. **GPU is the highest-impact upgrade** — Even a budget RTX 3060 would reduce latency by 3-5x
6. **Cold start is significant** — First call on CPU-only takes ~17 seconds; warmup system reduces this to normal levels
7. **Recording (VAD) dominates GPU-accelerated systems** — At 2s per turn, VAD accounts for ~80% of total latency on GPU systems

---

## Recommended Upgrade Path

```
Step 1: Implement warmup system          ✅ (This cycle)
Step 2: Add latency tracking             ✅ (This cycle)
Step 3: Install GPU (RTX 3060+)          📋 Next priority
Step 4: Upgrade to larger model (7B)     📋 After GPU
Step 5: Deploy FreeSWITCH on Docker      📋 This cycle
Step 6: Connect SIP trunk                📋 This cycle
```
