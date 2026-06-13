#!/usr/bin/env python3
"""
STT Microphone Test using ffmpeg (DirectShow) for audio capture.

This bypasses the PortAudio compatibility issue on your laptop.
Uses ffmpeg (which uses DirectShow/Media Foundation) to capture audio.

  python scripts/test_stt_ffmpeg.py

Flow:
  1. Beep -> start speaking
  2. ffmpeg records 6 seconds to temp file
  3. Beep -> stop speaking
  4. Whisper transcribes
"""

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
RECORD_SECONDS = 6
FFMPEG_PATH = "ffmpeg"
MIC_NAME = "Microphone Array (Realtek(R) Audio)"
TEMP_WAV = "temp_ffmpeg_capture.wav"


async def main():
    print("=" * 55)
    print("  STT MIC TEST (ffmpeg capture)")
    print("=" * 55)
    print()

    print(f"  Mic: {MIC_NAME}")
    print(f"  Duration: {RECORD_SECONDS}s")
    print()

    for i in range(3, 0, -1):
        print(f"  {i}...")
        await asyncio.sleep(1)

    print()
    print("  ** BEEP ** - START SPEAKING NOW!")
    winsound.Beep(880, 200)  # 880Hz, 200ms beep
    await asyncio.sleep(0.1)

    print(f"  Recording for {RECORD_SECONDS} seconds via ffmpeg...")

    t0 = time.perf_counter()

    # Run ffmpeg to capture mic audio
    proc = await asyncio.create_subprocess_exec(
        FFMPEG_PATH,
        "-f", "dshow",
        "-i", f"audio={MIC_NAME}",
        "-ac", "1",
        "-ar", str(SAMPLE_RATE),
        "-sample_fmt", "s16",
        "-t", str(RECORD_SECONDS),
        "-y",
        TEMP_WAV,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    await proc.communicate()

    elapsed = time.perf_counter() - t0
    print(f"  Recording complete ({elapsed:.1f}s)")

    print()
    print("  ** BEEP BEEP ** - STOP SPEAKING!")
    winsound.Beep(880, 200)
    await asyncio.sleep(0.15)
    winsound.Beep(880, 200)

    # Check the file
    wav_path = Path(TEMP_WAV)
    if not wav_path.exists() or wav_path.stat().st_size == 0:
        print(f"\n  [FAIL] No audio captured. File is empty.")
        print("  Try running this command manually to test the mic:")
        print(f'    ffmpeg -f dshow -i audio="{MIC_NAME}" -t 3 -y test_manual.wav')
        sys.exit(1)

    audio_bytes = wav_path.read_bytes()
    print(f"\n  [OK] Captured: {wav_path.name} ({wav_path.stat().st_size:,} bytes)")

    # Analyze
    import wave as wave_lib
    with wave_lib.open(TEMP_WAV, 'rb') as wf:
        frames = wf.readframes(wf.getnframes())
        audio_np = np.frombuffer(frames, dtype=np.int16).astype("float32") / 32768.0
        rms = float(np.sqrt(np.mean(audio_np ** 2)))
        non_silent = (np.abs(audio_np) > 0.01).mean() * 100
        print(f"  RMS level: {rms:.6f}")
        print(f"  Non-silent: {non_silent:.2f}%")

    if rms < 0.005:
        print("\n  [WARN] Audio level is very low.")
        print("  The ffmpeg capture may have the same issue.")
        print("  Let's still try transcription with amplification...")
        amp = max(1.0, 0.05 / max(rms, 0.0001))
        audio_amped = np.clip(audio_np * amp, -1.0, 1.0)
    else:
        audio_amped = audio_np

    # Transcribe
    print("\n  Transcribing...", end=" ", flush=True)
    from app.config import settings
    from app.providers.gpu import detect_gpu_config
    from app.providers.stt.whisper import WhisperSTTProvider

    model_size = settings.WHISPER_MODEL_SIZE
    device = settings.WHISPER_DEVICE
    compute_type = settings.WHISPER_COMPUTE_TYPE
    if model_size == "auto":
        gpu = detect_gpu_config()
        model_size = gpu.recommended_whisper_model
        device = gpu.recommended_device
        compute_type = gpu.recommended_compute_type

    stt = WhisperSTTProvider(
        model_size=model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=settings.WHISPER_CPU_THREADS,
    )

    buf = BytesIO()
    sf.write(buf, audio_amped, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    t0 = time.perf_counter()
    try:
        text = await stt.transcribe(wav_bytes, language="en")
    except Exception as e:
        print(f"\n  [FAIL] STT Error: {e}")
        sys.exit(1)
    t_elapsed = time.perf_counter() - t0
    print(f"({t_elapsed:.1f}s)")

    if text and text.strip():
        print(f'\n  [OK] Transcription: "{text.strip()}"')
    else:
        print("\n  [FAIL] No speech detected.")

    # Cleanup
    wav_path.unlink(missing_ok=True)

    print()
    print("=" * 55)
    print("  Done!")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(main())
