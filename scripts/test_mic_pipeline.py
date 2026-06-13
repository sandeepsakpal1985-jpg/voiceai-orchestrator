#!/usr/bin/env python3
"""Test mic recording → Whisper transcription pipeline (simulates /voice 3)."""

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


def record_audio(duration: float) -> bytes:
    """Record from default mic, return WAV bytes."""
    print(f"Recording for {duration}s... (speak now!)")
    recording = sd.rec(
        int(duration * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocking=True,
    )
    audio = recording.flatten()

    buf = BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()

    rms = float(np.sqrt(np.mean(audio ** 2)))
    print(f"Captured {len(audio) / SAMPLE_RATE:.1f}s, RMS energy: {rms:.4f}")
    print(f"WAV size: {len(wav_bytes)} bytes")
    return wav_bytes, audio


async def main():
    print("=" * 50)
    print("  Mic Recording + STT Pipeline Test")
    print("  (simulates /voice 3)")
    print("=" * 50)
    print()

    # ── Step 1: Record ──
    print("[1/3] Recording from mic...")
    try:
        wav_bytes, audio_raw = record_audio(3.0)
    except Exception as e:
        print(f"  FAIL: Could not record: {e}")
        sys.exit(1)
    print("  OK")
    print()

    # ── Step 2: Transcribe ──
    print("[2/3] Initializing Whisper STT...")
    from app.providers.stt.whisper import WhisperSTTProvider

    # Use 'base' explicitly since 'auto' is not a valid faster-whisper model
    stt = WhisperSTTProvider(
        model_size="base",
        device="cpu",
        compute_type="int8",
        cpu_threads=4,
    )

    print("  Transcribing...", end=" ", flush=True)
    t0 = time.perf_counter()
    try:
        text = await stt.transcribe(wav_bytes, language="en")
    except Exception as e:
        print(f"\n  FAIL: {e}")
        sys.exit(1)
    elapsed = time.perf_counter() - t0
    print(f"({elapsed:.1f}s)")

    if text and text.strip():
        print(f'  Transcription: "{text.strip()}"')
    else:
        print("  (no speech detected - try speaking louder or closer to the mic)")
        print("  Note: This is normal if no one spoke during recording.")
    print()

    # ── Step 3: LLM + TTS (optional quick test) ──
    if text and text.strip():
        print("[3/3] Quick LLM + TTS test...")

        from app.providers.llm.ollama_real import OllamaLLMProvider
        llm = OllamaLLMProvider(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
        )

        print("  LLM thinking...", end=" ", flush=True)
        response = await llm.complete([
            {"role": "system", "content": "Answer concisely."},
            {"role": "user", "content": text.strip()},
        ], temperature=0.7, max_tokens=100)
        print("done!")
        print(f'  Response: "{response.strip()}"')

        from app.providers.tts.kokoro_provider import KokoroTTSProvider
        tts = KokoroTTSProvider()
        print("  TTS synthesizing...", end=" ", flush=True)
        audio = await tts.synthesize(
            text=response.strip(),
            voice_id=settings.DEFAULT_VOICE_ID,
            language="en",
            speaking_rate=settings.DEFAULT_SPEAKING_RATE,
        )
        print(f"done! ({len(audio)} bytes)")

        print()
        print("Playing audio back through speakers...")
        try:
            data, sr = sf.read(BytesIO(audio))
            sd.play(data, sr)
            sd.wait()
        except Exception as e:
            print(f"  Playback error: {e}")

    print()
    print("=" * 50)
    print("  Test complete!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
