#!/usr/bin/env python3
"""
Mic test with beep cues -- records, saves, transcribes.

  python scripts/test_mic_quick.py

- Beeps once -> start speaking
- Beeps twice -> stop speaking
- Records for 10 seconds
- Saves to test_mic_raw.wav
- Transcribes with Whisper
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
RECORD_SECONDS = 10


def find_best_mic() -> tuple[int, int, str]:
    """Find the best input device. Prefer WDM-KS (bypasses privacy), fallback to default."""
    for i, d in enumerate(sd.query_devices()):
        name: str = d["name"]
        if (
            d["max_input_channels"] > 0
            and d["hostapi"] == 3  # WDM-KS
            and "mic" in name.lower()
            and "speaker" not in name.lower()
            and "stereo mix" not in name.lower()
        ):
            return i, int(d["default_samplerate"]), name.strip()
    # Fallback: default input device
    dev = sd.default.device
    if isinstance(dev, tuple):
        dev = dev[0]
    info = sd.query_devices(dev)
    return dev, int(info["default_samplerate"]), info["name"].strip()


def generate_beep(freq: float = 880, duration: float = 0.2, sr: int = 44100) -> np.ndarray:
    """Generate a sine wave beep tone."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    tone = np.sin(2 * np.pi * freq * t) * 0.5
    return tone.astype("float32")


def play_beep(times: int = 1):
    """Play beep tone(s) through speakers."""
    tone = generate_beep(880, 0.15)
    gap = np.zeros(int(44100 * 0.1), dtype="float32")  # 100ms gap between beeps
    if times == 1:
        signal = tone
    else:
        parts = []
        for i in range(times):
            parts.append(tone)
            if i < times - 1:
                parts.append(gap)
        signal = np.concatenate(parts)
    sd.play(signal, 44100, blocking=True)


async def main():
    print("=" * 55)
    print("  MICROPHONE TEST - SPEAK CLEARLY WHEN PROMPTED")
    print("=" * 55)
    print()

    dev_idx, native_sr, dev_name = find_best_mic()
    api_name = ["MME", "DirectSound", "WASAPI", "WDM-KS"][
        sd.query_devices(dev_idx)["hostapi"]
    ]
    print(f"  Device [{dev_idx}]: {dev_name} ({api_name})")
    print(f"  Sample rate: {native_sr} Hz")
    print()

    print(f"  Get ready... recording will be {RECORD_SECONDS} seconds")
    for i in range(3, 0, -1):
        print(f"  {i}...")
        await asyncio.sleep(1)

    print()
    print("  ** BEEP ** -- START SPEAKING NOW!")
    play_beep(1)  # Single beep = start
    print(f"  Recording for {RECORD_SECONDS} seconds...")

    # Record audio
    if api_name == "WDM-KS":
        recording = sd.rec(
            int(RECORD_SECONDS * native_sr),
            samplerate=native_sr,
            channels=1,
            dtype="int16",
            device=dev_idx,
            blocking=True,
        )
        audio_int16 = recording.flatten()
        audio_float = audio_int16.astype("float32") / 32768.0
    else:
        recording = sd.rec(
            int(RECORD_SECONDS * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocking=True,
        )
        audio_float = recording.flatten()
        audio_int16 = None

    print("  ** BEEP BEEP ** -- STOP SPEAKING!")
    play_beep(2)  # Double beep = stop

    # Save a playable WAV
    wav_path = Path("test_mic_raw.wav")
    if audio_int16 is not None:
        sf.write(str(wav_path), audio_int16, native_sr, subtype="PCM_16")
    else:
        sf.write(str(wav_path), audio_float, SAMPLE_RATE, subtype="PCM_16")
    print(f"  [OK] Saved: {wav_path} ({wav_path.stat().st_size:,} bytes)")
    print()

    # Audio stats
    rms = float(np.sqrt(np.mean(audio_float ** 2)))
    non_silent_pct = (np.abs(audio_float) > 0.01).mean() * 100
    print(f"  RMS level:  {rms:.6f}")
    print(f"  Non-silent: {non_silent_pct:.2f}%")
    print()

    if rms < 0.005:
        print("  [WARN] Very low audio. Possible causes:")
        print("     - Laptop mic mute button (Fn+F4, F8, or similar)")
        print("     - Mic privacy settings (check Settings -> Privacy -> Microphone)")
        print("     - Try USB/external microphone")
        print()
        amp_factor = max(1.0, 0.05 / max(rms, 0.0001))
        print(f"  Trying transcription with {amp_factor:.0f}x amplification...")
        audio_amped = np.clip(audio_float * amp_factor, -1.0, 1.0)
    else:
        audio_amped = audio_float

    # Transcribe
    print()
    print("  Transcribing...", end=" ", flush=True)
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
    elapsed = time.perf_counter() - t0
    print(f"({elapsed:.1f}s)")

    if text and text.strip():
        print(f'\n  [OK] Transcription: "{text.strip()}"')
    else:
        print("\n  [FAIL] No speech detected.")

    print()
    print("=" * 55)
    print("  Done!")
    print("=" * 55)


if __name__ == "__main__":
    asyncio.run(main())
