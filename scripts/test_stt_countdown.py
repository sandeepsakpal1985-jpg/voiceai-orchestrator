#!/usr/bin/env python3
"""
Quick STT Test — Records mic with a countdown, transcribes with Whisper.

Usage:
    python scripts/test_stt_countdown.py          # 5 sec recording
    python scripts/test_stt_countdown.py --sec 8  # 8 sec recording
"""

import asyncio
import sys
import time
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import sounddevice as sd
import soundfile as sf

SAMPLE_RATE = 16000

# WDM-KS device bypasses Windows privacy layer — use it for reliable mic access
WDM_KS_DEVICE = None  # will be auto-detected


def _find_wdm_ks_device() -> int | None:
    """Find the best WDM-KS input device (hostapi 3 on Windows)."""
    for i, d in enumerate(sd.query_devices()):
        if (
            d["max_input_channels"] > 0
            and d["hostapi"] == 3
            and "mic" in d["name"].lower()
            and "speaker" not in d["name"].lower()
        ):
            return i
    return None


def record_audio(duration: float) -> np.ndarray:
    """Record audio using WDM-KS for reliable mic access."""
    global WDM_KS_DEVICE
    if WDM_KS_DEVICE is None:
        WDM_KS_DEVICE = _find_wdm_ks_device()

    if WDM_KS_DEVICE is not None:
        # WDM-KS needs native rate + int16, then resample
        native_sr = 44100
        print(f"  (using WDM-KS device {WDM_KS_DEVICE} @ {native_sr}Hz, int16)")
        recording = sd.rec(
            int(duration * native_sr),
            samplerate=native_sr,
            channels=1,
            dtype="int16",
            device=WDM_KS_DEVICE,
            blocking=True,
        )
        # Normalize to float32 [-1, 1]
        audio_float = recording.flatten().astype("float32") / 32768.0
        # Resample to 16kHz via simple decimation (44100 → 16000 = factor 2.756)
        # Use scipy for proper resampling
        from scipy import signal
        target_len = int(len(audio_float) * SAMPLE_RATE / native_sr)
        audio_float = signal.resample(audio_float, target_len)
        return audio_float.astype("float32")
    else:
        # Fallback to default device
        print(f"  (using default mic @ {SAMPLE_RATE}Hz, float32 — fallback)")
        recording = sd.rec(
            int(duration * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocking=True,
        )
        return recording.flatten()


def write_wav_16k(audio_float: np.ndarray) -> bytes:
    """Write float32 audio as WAV at 16kHz."""
    buf = BytesIO()
    sf.write(buf, audio_float, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def main():
    duration = 5.0
    if "--sec" in sys.argv:
        idx = sys.argv.index("--sec")
        if idx + 1 < len(sys.argv):
            duration = float(sys.argv[idx + 1])

    print("=" * 50)
    print("  STT Microphone Test")
    print("  (using default Windows mic)")
    print("=" * 50)
    print()

    # Countdown so user can prepare
    for i in range(3, 0, -1):
        print(f"  Starting in {i}...")
        await asyncio.sleep(1)

    print(f"\n  >> Recording for {duration:.0f} seconds -- SPEAK NOW!")
    print()

    audio = record_audio(duration)
    
    rms = float(np.sqrt(np.mean(audio ** 2)))
    print(f"  Captured {len(audio) / SAMPLE_RATE:.1f}s, RMS energy: {rms:.6f} (normalized)")

    if rms < 0.005:
        print("  [WARN] Very low audio level. Try:")
        print("     - Speak louder / closer to the mic")
        print("     - Check mic isn't muted in Windows")
        print("     - Run: python -c \"import sounddevice as sd; print(sd.default.device)\"")
        print()
    else:
        print("  [OK] Good audio level detected!")
        print()

    # Write WAV at 16kHz for Whisper
    wav_bytes = write_wav_16k(audio)
    print(f"  WAV size: {len(wav_bytes):,} bytes")
    print()

    # Initialize Whisper STT
    print("  Initializing Whisper STT...")

    from app.config import settings
    from app.providers.gpu import detect_gpu_config
    from app.providers.stt.whisper import WhisperSTTProvider

    # Resolve "auto" model size to actual model
    model_size = settings.WHISPER_MODEL_SIZE
    device = settings.WHISPER_DEVICE
    compute_type = settings.WHISPER_COMPUTE_TYPE

    if model_size == "auto":
        gpu = detect_gpu_config()
        model_size = gpu.recommended_whisper_model
        device = gpu.recommended_device
        compute_type = gpu.recommended_compute_type

    print(f"  Model: {model_size}, Device: {device}, Compute: {compute_type}")

    stt = WhisperSTTProvider(
        model_size=model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=settings.WHISPER_CPU_THREADS,
    )

    print("  Transcribing...", end=" ", flush=True)
    t0 = time.perf_counter()
    try:
        text = await stt.transcribe(wav_bytes, language="en")
    except Exception as e:
        print(f"\n  [FAIL] STT Error: {e}")
        sys.exit(1)
    elapsed = time.perf_counter() - t0
    print(f"({elapsed:.1f}s)")

    if text and text.strip():
        print(f'\n  [OK] Transcription: "{text.strip()}"')
    else:
        print("\n  [FAIL] No speech detected in the recording.")
        print("     Try: speak clearly, or increase --sec 8")

    print()
    print("=" * 50)
    print("  Test complete!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
