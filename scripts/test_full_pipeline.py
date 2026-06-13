#!/usr/bin/env python3
"""
Full Pipeline Test — Mic → STT → LLM → TTS → Playback

Records from mic via ffmpeg (DirectShow), transcribes with Whisper,
processes through LLM, synthesizes with TTS, and plays back.

Usage:
    python scripts/test_full_pipeline.py [--duration 6] [--cloud]
    
Flags:
    --duration N   Recording length in seconds (default: 6)
    --cloud        Use cloud providers (Deepgram STT + OpenAI LLM + ElevenLabs TTS)
                   for much faster results (~3-5s vs ~30-50s local)
"""

import argparse
import asyncio
import subprocess
import sys
import time
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import soundfile as sf
import winsound

SAMPLE_RATE = 16000
FFMPEG_PATH = "ffmpeg"
MIC_NAME = "Microphone Array (Realtek(R) Audio)"
TEMP_WAV = "temp_pipeline_capture.wav"

BEEP_START = (880, 200)     # Hz, ms
BEEP_STOP = (660, 150)


def beep(frequency: int, duration_ms: int):
    """Play a system beep."""
    try:
        winsound.Beep(frequency, duration_ms)
    except Exception:
        pass


async def record_mic_ffmpeg(duration: int) -> bytes:
    """Record mic via ffmpeg DirectShow, return WAV bytes."""
    proc = await asyncio.create_subprocess_exec(
        FFMPEG_PATH,
        "-f", "dshow",
        "-i", f"audio={MIC_NAME}",
        "-ac", "1",
        "-ar", str(SAMPLE_RATE),
        "-sample_fmt", "s16",
        "-t", str(duration),
        "-y",
        TEMP_WAV,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    await proc.communicate()

    wav_path = Path(TEMP_WAV)
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        raise RuntimeError("No audio captured from mic")

    return wav_path.read_bytes()


async def main():
    parser = argparse.ArgumentParser(description="Full Pipeline Test")
    parser.add_argument("--duration", type=int, default=6, help="Recording duration in seconds")
    parser.add_argument("--cloud", action="store_true", help="Use cloud providers for speed")
    args = parser.parse_args()

    duration = max(3, min(15, args.duration))
    use_cloud = args.cloud

    # ── Providers ─────────────────────────────────────────────────
    from app.config import settings
    from app.providers.gpu import detect_gpu_config
    from app.providers.stt.whisper import WhisperSTTProvider
    from app.providers.llm.ollama_real import OllamaLLMProvider
    from app.providers.tts.kokoro_provider import KokoroTTSProvider

    print("=" * 55)
    print("  Full Pipeline Test — Mic -> STT -> LLM -> TTS -> Playback")
    print("=" * 55)
    print()

    # Resolve Whisper model
    whisper_model = settings.WHISPER_MODEL_SIZE
    whisper_device = settings.WHISPER_DEVICE
    whisper_compute = settings.WHISPER_COMPUTE_TYPE
    if whisper_model == "auto":
        gpu = detect_gpu_config()
        whisper_model = gpu.recommended_whisper_model
        whisper_device = gpu.recommended_device
        whisper_compute = gpu.recommended_compute_type

    # Initialize STT
    print(f"  STT:  {settings.STT_PROVIDER} / {whisper_model} ({whisper_device})")
    stt = WhisperSTTProvider(
        model_size=whisper_model,
        device=whisper_device,
        compute_type=whisper_compute,
        cpu_threads=settings.WHISPER_CPU_THREADS,
    )

    # Initialize LLM
    if use_cloud and settings.OPENAI_API_KEY:
        from app.providers.llm.openai import OpenAILLMProvider
        llm = OpenAILLMProvider(api_key=settings.OPENAI_API_KEY)
        print(f"  LLM:  openai / gpt-4o-mini")
    else:
        llm = OllamaLLMProvider(base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL)
        print(f"  LLM:  ollama / {settings.OLLAMA_MODEL}")
        if not use_cloud:
            print("        (Use --cloud for much faster LLM via OpenAI)")

    # Initialize TTS
    if use_cloud and settings.ELEVENLABS_API_KEY:
        from app.providers.tts.elevenlabs_real import ElevenLabsTTSProvider
        tts = ElevenLabsTTSProvider(api_key=settings.ELEVENLABS_API_KEY)
        print(f"  TTS:  elevenlabs / {settings.DEFAULT_VOICE_ID}")
    else:
        tts = KokoroTTSProvider()
        print(f"  TTS:  kokoro / {settings.DEFAULT_VOICE_ID}")

    print(f"  Rec:  {duration}s via ffmpeg DirectShow")
    print()

    # ── Step 1: Record ────────────────────────────────────────────
    print("-" * 55)
    print("  STEP 1: Record from mic")
    print("-" * 55)

    for i in range(3, 0, -1):
        print(f"    {i}...")
        await asyncio.sleep(1)

    print()
    print("  ** BEEP ** - START SPEAKING NOW!")
    beep(*BEEP_START)
    await asyncio.sleep(0.2)

    t0 = time.perf_counter()
    try:
        wav_bytes = await record_mic_ffmpeg(duration)
    except RuntimeError as e:
        print(f"  [FAIL] {e}")
        sys.exit(1)
    record_time = time.perf_counter() - t0

    beep(*BEEP_STOP)
    await asyncio.sleep(0.15)
    beep(*BEEP_STOP)
    print("  ** BEEP BEEP ** - STOP SPEAKING!")

    # Analyze
    import wave as wave_lib
    with wave_lib.open(TEMP_WAV, 'rb') as wf:
        frames = wf.readframes(wf.getnframes())
        audio_np = np.frombuffer(frames, dtype=np.int16).astype("float32") / 32768.0
        rms = float(np.sqrt(np.mean(audio_np ** 2)))
        non_silent = (np.abs(audio_np) > 0.01).mean() * 100

    print(f"  [OK] Captured: {len(wav_bytes):,} bytes ({record_time:.1f}s)")
    print(f"  RMS: {rms:.6f} | Non-silent: {non_silent:.1f}%")

    # Amplify if quiet
    if rms < 0.005 and rms > 0:
        amp = min(5.0, 0.05 / rms)
        audio_np = np.clip(audio_np * amp, -1.0, 1.0)
        print(f"  (amplified {amp:.1f}x)")

    buf = BytesIO()
    sf.write(buf, audio_np, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    wav_bytes_processed = buf.getvalue()

    # Cleanup temp
    Path(TEMP_WAV).unlink(missing_ok=True)
    print()

    # ── Step 2: STT ───────────────────────────────────────────────
    print("-" * 55)
    print("  STEP 2: Speech-to-Text (STT)")
    print("-" * 55)

    print("  Transcribing...", end=" ", flush=True)
    t0 = time.perf_counter()
    text = await stt.transcribe(wav_bytes_processed, language="en")
    stt_time = time.perf_counter() - t0
    print(f"({stt_time:.1f}s)")

    if not text or not text.strip():
        print("  [FAIL] No speech detected in recording.")
        print("  Make sure to speak clearly after the beep.")
        sys.exit(1)

    print(f'  [STT Result] "{text.strip()}"')
    print()

    # ── Step 3: LLM ───────────────────────────────────────────────
    print("-" * 55)
    print("  STEP 3: Language Model (LLM)")
    print("-" * 55)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a friendly AI voice assistant. Respond concisely and "
                "conversationally in under 60 words. Do not use lists or markdown. "
                "Acknowledge what the user said and respond naturally."
            ),
        },
        {"role": "user", "content": text.strip()},
    ]

    print("  Thinking...", end=" ", flush=True)
    t0 = time.perf_counter()
    response = await llm.complete(messages, temperature=0.7, max_tokens=200)
    llm_time = time.perf_counter() - t0
    print(f"({llm_time:.1f}s)")
    print(f'  [LLM Result] "{response.strip()}"')
    print()

    # ── Step 4: TTS ───────────────────────────────────────────────
    print("-" * 55)
    print("  STEP 4: Text-to-Speech (TTS)")
    print("-" * 55)

    print("  Synthesizing...", end=" ", flush=True)
    t0 = time.perf_counter()
    audio = await tts.synthesize(
        text=response.strip(),
        voice_id=settings.DEFAULT_VOICE_ID,
        language="en",
        speaking_rate=settings.DEFAULT_SPEAKING_RATE,
    )
    tts_time = time.perf_counter() - t0
    print(f"({tts_time:.1f}s)")
    print(f"  [TTS Result] {len(audio):,} bytes")
    print()

    # ── Step 5: Playback ──────────────────────────────────────────
    print("-" * 55)
    print("  STEP 5: Playback")
    print("-" * 55)

    try:
        data, sr = sf.read(BytesIO(audio))
        import sounddevice as sd
        sd.play(data, sr)
        sd.wait()
        print("  [OK] Playback complete")
    except Exception as e:
        print(f"  [WARN] Playback failed: {e}")
        # Save to file as fallback
        output_path = "pipeline_output.wav"
        sf.write(output_path, data, sr)
        print(f"  [Saved] Audio saved to {output_path}")

    print()

    # ── Summary ───────────────────────────────────────────────────
    total = record_time + stt_time + llm_time + tts_time
    print("=" * 55)
    print("  PIPELINE SUMMARY")
    print("=" * 55)
    print(f"  Record:  {record_time:.1f}s  ({duration}s of audio)")
    print(f"  STT:     {stt_time:.1f}s  \"{text.strip()[:50]}...\"")
    print(f"  LLM:     {llm_time:.1f}s  \"{response.strip()[:50]}...\"")
    print(f"  TTS:     {tts_time:.1f}s  ({len(audio):,} bytes)")
    print(f"  ----------------------------------------")
    print(f"  TOTAL:   {total:.1f}s")
    print()
    if not use_cloud and total > 15:
        print("  Tip: Use --cloud for much faster results (Deepgram + OpenAI + ElevenLabs)")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(main())
