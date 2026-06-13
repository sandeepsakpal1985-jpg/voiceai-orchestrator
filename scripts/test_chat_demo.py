#!/usr/bin/env python3
"""Quick interactive test — simulates typing a message and hearing a response."""

import asyncio
import sys
import time
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sounddevice as sd
import soundfile as sf


async def main():
    print("=" * 60)
    print("  VoiceAI -- Interactive Chat Demo")
    print("  (simulated via direct provider calls)")
    print("=" * 60)
    print()

    print("  Initializing providers...")
    from app.providers import get_default_registry, reset_default_registry
    from app.providers.llm.ollama_real import OllamaLLMProvider
    from app.providers.tts.kokoro_provider import KokoroTTSProvider
    from app.config import settings

    reset_default_registry()
    registry = get_default_registry()
    registry.register_llm("ollama", OllamaLLMProvider(
        base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL,
    ))
    registry.register_tts("kokoro", KokoroTTSProvider())

    llm = registry.get_llm("ollama")
    tts = registry.get_tts("kokoro")

    print(f"  LLM: {llm.provider_name}")
    print(f"  TTS: {tts.provider_name}")
    print()

    system_prompt = (
        "You are a friendly AI voice assistant. Keep responses concise "
        "and conversational (under 80 words). Speak naturally."
    )

    messages = [{"role": "system", "content": system_prompt}]

    # Simulate a user typing a message
    user_msg = "how are you doing? this is my test message"
    print(f"  [You] {user_msg}")
    print()

    # LLM
    print("  [AI] ", end="", flush=True)
    t0 = time.perf_counter()
    response = await llm.complete(
        messages + [{"role": "user", "content": user_msg}],
        temperature=0.7,
        max_tokens=100,
    )
    t1 = time.perf_counter()
    print(f"{response}")
    print(f"       (LLM took {t1-t0:.1f}s)")
    print()

    # TTS
    print("  [TTS] Speaking...", end=" ", flush=True)
    t0 = time.perf_counter()
    audio = await tts.synthesize(
        text=response,
        voice_id=settings.DEFAULT_VOICE_ID,
        language="en",
        speaking_rate=1.0,
    )
    t1 = time.perf_counter()
    print(f"done! ({len(audio)} bytes, {t1-t0:.1f}s)")
    print()

    # Play audio
    print("  Playing audio through speakers...")
    try:
        data, sr = sf.read(BytesIO(audio))
        sd.play(data, sr)
        sd.wait()
    except Exception as e:
        print(f"  Playback error: {e}")

    print()
    print("=" * 60)
    print("  Demo complete! To run the full interactive chat:")
    print()
    print("    python scripts/terminal_chat.py")
    print()
    print("  Commands available:")
    print("    /voice [sec]   - record mic for N seconds")
    print("    /record        - continuous VAD recording")
    print("    /lang [code]   - switch language")
    print("    /export        - save transcript")
    print("    /quit          - exit")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
