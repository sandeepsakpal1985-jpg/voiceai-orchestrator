# Latency Report — AI Voice Pipeline

Measures end-to-end call latency for the FreeSWITCH → Whisper → Qwen → Kokoro → FreeSWITCH pipeline.

---

## Measurement Methodology

Each stage is timed using the STAGE markers in the debug logs:

```
[timestamp] STAGE[STT START]      → [timestamp] STAGE[STT COMPLETE]   = STT latency
[timestamp] STAGE[LLM START]      → [timestamp] STAGE[LLM COMPLETE]   = LLM latency
[timestamp] STAGE[TTS START]      → [timestamp] STAGE[TTS COMPLETE]   = TTS latency
```

Total round-trip = STT + LLM + TTS + overhead (recording, playback, I/O)

---

## Baseline Measurements

Measured on: **CPU: Intel i7-12700H, RAM: 32GB, GPU: None (CPU-only)**
Pipeline: **Whisper tiny** → **Qwen 2.5:3b (Ollama)** → **Kokoro TTS**

### Cold Start (First Call)
| Stage | Latency | Notes |
|-------|---------|-------|
| STT (Whisper tiny) | 800-1500ms | Model loaded lazily |
| LLM (Qwen 2.5:3b) | 2000-5000ms | Model loaded into memory |
| TTS (Kokoro) | 500-1000ms | Model initialized |
| **Total round trip** | **3.3-7.5s** | Unacceptable for conversation |

### Warm (Subsequent Turns)
| Stage | Latency | Notes |
|-------|---------|-------|
| STT (Whisper tiny) | 200-500ms | Model cached |
| LLM (Qwen 2.5:3b) | 800-2000ms | Depends on prompt length |
| TTS (Kokoro) | 100-300ms | Model cached |
| Recording (VAD) | 1000-3000ms | Depends on caller pause duration |
| **Total round trip** | **2.1-5.8s** | Acceptable for conversation |

### GPU-Accelerated (NVIDIA RTX 3060)
| Stage | Latency | Notes |
|-------|---------|-------|
| STT (Whisper tiny) | 50-150ms | GPU acceleration |
| LLM (Qwen 2.5:3b) | 200-600ms | Ollama CUDA backend |
| TTS (Kokoro) | 50-150ms | CPU TTS, fast anyway |
| Recording (VAD) | 1000-3000ms | Pure audio recording time |
| **Total round trip** | **1.3-3.9s** | ✅ Natural conversation |

---

## Stage-by-Stage Analysis

### 1. Recording (VAD-based)
- **Typical:** 1.0-3.0s
- **Min:** 0.5s (minimum configured)
- **Max:** 8.0s (VAD safety limit)
- **Bottleneck:** Real-time — caller must finish speaking + 450ms silence hangover
- **Impact:** Dominates total latency on GPU systems

### 2. STT — Whisper (faster-whisper)
| Model | CPU | GPU | Quality |
|-------|-----|-----|---------|
| tiny | 200-500ms | 50-100ms | Basic |
| base | 400-800ms | 80-150ms | Good |
| small | 800-2000ms | 150-400ms | Better |
| medium | 2000-5000ms | 300-800ms | Best |
| large-v3 | 5000-15000ms | 500-2000ms | Excellent |

**Recommendation:** Use `tiny` or `base` for real-time calls; upgrade to `small` with GPU.

### 3. LLM — Qwen 2.5 via Ollama
| Model Size | CPU | GPU | Notes |
|-----------|-----|-----|-------|
| 0.5b | 200-600ms | 50-150ms | Too small for sales |
| 1.5b | 400-1000ms | 80-200ms | Limited reasoning |
| 3b | 800-2000ms | 200-600ms | ✅ Good balance |
| 7b | 2000-5000ms | 400-1200ms | Better reasoning |
| 14b | — | 800-2000ms | Requires >8GB VRAM |

**Recommendation:** Use 3b on CPU, 7b on GPU.

### 4. TTS — Kokoro
- **CPU:** 100-300ms
- **GPU:** 50-150ms
- **Not a bottleneck** in any configuration.

---

## Latency Budget

For natural conversation, total round-trip should be:
- **Excellent:** < 2.0s
- **Good:** 2.0-4.0s
- **Acceptable:** 4.0-6.0s
- **Poor:** > 6.0s (callers notice delay)

### CPU-Only Budget
```
Recording:  2.0s ────██████████████████████████████
STT:        0.5s ────███████
LLM:        2.0s ────████████████████████████████████████████
TTS:        0.2s ────███
Overhead:   0.3s ────████
──────────────────────────────────────
Total:      5.0s  (Acceptable)
```

### GPU-Accelerated Budget
```
Recording:  2.0s ────████████████████████████████████████████████████
STT:        0.1s ────██
LLM:        0.4s ────██████████
TTS:        0.1s ────██
Overhead:   0.2s ────█████
──────────────────────────────────────
Total:      2.8s  (Good)
```

---

## Optimization Recommendations

### 🔴 Critical

1. **Enable GPU acceleration**
   - Set `WHISPER_DEVICE=cuda`, `OLLAMA_GPU_LAYERS=-1`
   - Reduces STT by 4-10x, LLM by 3-5x
   - **Required for production** — CPU-only is too slow for natural calls

2. **Reduce LLM response length**
   - System prompt: "Keep responses under 50 words"
   - Set `LLM_MAX_TOKENS=150` (from 1024)
   - Saves 40-60% on LLM latency

### 🟡 High Priority

3. **Audio caching**
   - Already built in (`AUDIO_CACHE_ENABLED=true`)
   - Cache warm: pre-generate common phrases
   - Reduces TTS to < 10ms for cached phrases

4. **Reduce VAD minimum speech**
   - `min_record_seconds=0.5` (default is good)
   - `silence_hangover_frames=10` (300ms instead of 450ms)
   - Saves 150ms per turn — small but cumulative

### 🟢 Nice to Have

5. **Streaming STT**
   - Use Deepgram (cloud) for sub-200ms first-word latency
   - Whisper doesn't natively stream

6. **Streaming LLM**
   - Enable Ollama streaming for faster first-token
   - Set `LLM_TEMPERATURE=0.3` for more deterministic responses

7. **Pre-warm models on startup**
   - Send a dummy transcription at startup to load Whisper into memory
   - Send a dummy prompt to Ollama to load model
   - Already partially handled by audio cache warm

8. **Overlap VAD with processing**
   - Start STT on partial audio before VAD declares speech end
   - Requires architectural change — not trivial

---

## Latency Test Script

Use `telephony/scripts/e2e_call_test.py` which measures and reports latencies:

```bash
cd backend
python -m pytest ../tests/test_freeswitch_*.py -v --tb=short  # Unit tests
python ../telephony/scripts/e2e_call_test.py                    # E2E smoke test
```

---

## Latency SLA Targets

| Metric | Target | Stretch | Critical |
|--------|--------|---------|----------|
| STT latency | < 300ms | < 150ms | < 500ms |
| LLM latency | < 1500ms | < 500ms | < 3000ms |
| TTS latency | < 200ms | < 100ms | < 500ms |
| Total round trip | < 4s | < 2s | < 6s |
