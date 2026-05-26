#!/usr/bin/env python3
"""
Voice Pipeline CLI Test Tool — Test STT → LLM → TTS end-to-end.

This command-line tool exercises the VoiceAI voice pipeline by sending
test audio through each stage and reporting results. It can:

  1. Transcribe a WAV file through the configured STT provider
  2. Send the transcription through the LLM for a response
  3. Synthesize the LLM response through the TTS provider
  4. Run the full pipeline (STT → LLM → TTS) in one command
  5. Benchmark latency for each stage

Usage:
    python scripts/test_voice_pipeline.py transcribe demo.wav
    python scripts/test_voice_pipeline.py complete "Hello, how are you?"
    python scripts/test_voice_pipeline.py synthesize "Hello world" --output response.wav
    python scripts/test_voice_pipeline.py pipeline demo.wav --output response.wav
    python scripts/test_voice_pipeline.py benchmark demo.wav --iterations 3

Environment Variables:
    STT_PROVIDER       — STT provider to use (default: whisper)
    LLM_PROVIDER       — LLM provider to use (default: ollama)
    TTS_PROVIDER       — TTS provider to use (default: kokoro)
    ASSEMBLYAI_API_KEY — Required if STT_PROVIDER=assemblyai
    DEEPGRAM_API_KEY   — Required if STT_PROVIDER=deepgram
    OPENAI_API_KEY     — Required if LLM_PROVIDER=openai
    ELEVENLABS_API_KEY — Required if TTS_PROVIDER=elevenlabs
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _format_duration(seconds: float) -> str:
    """Format duration in a human-readable way."""
    if seconds < 0.001:
        return f"{seconds * 1_000_000:.0f}µs"
    elif seconds < 1.0:
        return f"{seconds * 1_000:.1f}ms"
    else:
        return f"{seconds:.2f}s"


def _load_wav(path: str) -> bytes:
    """Load a WAV file from disk."""
    path_obj = Path(path)
    if not path_obj.exists():
        print(f"[ERROR] File not found: {path}")
        sys.exit(1)
    with open(path_obj, "rb") as f:
        data = f.read()
    print(f"  Loaded {len(data):,} bytes from {path}")
    return data


# ── Provider Initialization ─────────────────────────────────────────

def _init_registry():
    """Initialize the provider registry with all available providers."""
    from app.providers import ProviderRegistry, get_default_registry, reset_default_registry
    from app.providers.stt.whisper import WhisperSTTProvider
    from app.config import settings

    reset_default_registry()
    registry = get_default_registry()

    # Register STT providers
    registry.register_stt("whisper", WhisperSTTProvider(
        model_size=settings.WHISPER_MODEL,
        device=settings.WHISPER_DEVICE,
        compute_type=settings.WHISPER_COMPUTE_TYPE,
    ))

    # Try to register Deepgram if API key is available
    deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
    if deepgram_key:
        try:
            from app.providers.stt.deepgram_real import DeepgramSTTProvider
            registry.register_stt("deepgram", DeepgramSTTProvider(api_key=deepgram_key))
            print("  [OK] Deepgram STT provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register Deepgram: {e}")

    # Try to register AssemblyAI if API key is available
    assemblyai_key = os.getenv("ASSEMBLYAI_API_KEY", "")
    if assemblyai_key:
        try:
            from app.providers.stt.assemblyai_real import AssemblyAISTTProvider
            registry.register_stt("assemblyai", AssemblyAISTTProvider(api_key=assemblyai_key))
            print("  [OK] AssemblyAI STT provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register AssemblyAI: {e}")

    # Register LLM providers
    from app.providers.llm.ollama_real import OllamaLLMProvider
    registry.register_llm("ollama", OllamaLLMProvider(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
    ))

    openai_key = os.getenv("OPENAI_API_KEY", "")
    if openai_key:
        try:
            from app.providers.llm.openai import OpenAILLMProvider
            registry.register_llm("openai", OpenAILLMProvider(api_key=openai_key))
            print("  [OK] OpenAI LLM provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register OpenAI: {e}")

    # Register TTS providers
    from app.providers.tts.kokoro_provider import KokoroTTSProvider
    registry.register_tts("kokoro", KokoroTTSProvider())

    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
    if elevenlabs_key:
        try:
            from app.providers.tts.elevenlabs_real import ElevenLabsTTSProvider
            registry.register_tts("elevenlabs", ElevenLabsTTSProvider(api_key=elevenlabs_key))
            print("  [OK] ElevenLabs TTS provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register ElevenLabs: {e}")

    return registry


# ── Commands ────────────────────────────────────────────────────────


async def cmd_transcribe(args):
    """Transcribe a WAV file using the configured STT provider."""
    from app.config import settings
    registry = _init_registry()
    stt = registry.get_stt(settings.STT_PROVIDER)

    audio_data = _load_wav(args.file)

    print(f"\n  STT Provider: {stt.provider_name}")
    print(f"  Language: {args.language}")
    print(f"  Audio size: {len(audio_data):,} bytes")
    print()

    start = time.perf_counter()
    text = await stt.transcribe(audio_data, language=args.language)
    elapsed = time.perf_counter() - start

    print(f"  ⏱  Duration: {_format_duration(elapsed)}")
    print(f"  📝 Transcription:")
    print(f"     {text}")
    return text


async def cmd_complete(args):
    """Send a prompt to the LLM and get a response."""
    from app.config import settings
    registry = _init_registry()
    llm = registry.get_llm(settings.LLM_PROVIDER)

    system_prompt = args.system or (
        "You are a helpful AI assistant. Keep responses concise and clear."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": args.text},
    ]

    print(f"\n  LLM Provider: {llm.provider_name}")
    print(f"  System: {system_prompt}")
    print(f"  User:   {args.text}")
    print()

    start = time.perf_counter()
    response = await llm.complete(
        messages,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    elapsed = time.perf_counter() - start

    print(f"  ⏱  Duration: {_format_duration(elapsed)}")
    print(f"  🤖 Response:")
    print(f"     {response}")
    return response


async def cmd_synthesize(args):
    """Synthesize text to speech using the configured TTS provider."""
    from app.config import settings
    registry = _init_registry()
    tts = registry.get_tts(settings.TTS_PROVIDER)

    voice_id = args.voice or settings.DEFAULT_VOICE_ID
    language = args.language or settings.DEFAULT_LANGUAGE

    print(f"\n  TTS Provider: {tts.provider_name}")
    print(f"  Voice: {voice_id}")
    print(f"  Language: {language}")
    print(f"  Text: {args.text[:80]}{'...' if len(args.text) > 80 else ''}")
    print()

    start = time.perf_counter()
    audio = await tts.synthesize(
        text=args.text,
        voice_id=voice_id,
        language=language,
    )
    elapsed = time.perf_counter() - start

    print(f"  ⏱  Duration: {_format_duration(elapsed)}")
    print(f"  🔊 Audio size: {len(audio):,} bytes")

    if args.output:
        with open(args.output, "wb") as f:
            f.write(audio)
        print(f"  💾 Saved to: {args.output}")

    return audio


async def cmd_pipeline(args):
    """Run the full STT → LLM → TTS pipeline."""
    from app.config import settings
    from app.voice import get_voice_pipeline

    # Reinitialize pipeline with fresh registry
    _init_registry()
    pipeline = get_voice_pipeline()

    audio_data = _load_wav(args.file)
    language = args.language or "en"
    system_prompt = args.system or None

    print(f"\n  Pipeline Configuration:")
    print(f"    STT: {pipeline.stt.provider_name}")
    print(f"    LLM: {pipeline.llm.provider_name}")
    print(f"    TTS: {pipeline.tts.provider_name}")
    print(f"    Language: {language}")
    print()

    # Step 1: STT
    print("─── Step 1: STT ───")
    start = time.perf_counter()
    text = await pipeline.stt.transcribe(audio_data, language=language)
    stt_elapsed = time.perf_counter() - start
    print(f"  ⏱  {_format_duration(stt_elapsed)}")
    print(f"  📝 {text}")
    print()

    if not text.strip():
        print("[WARN] No transcription produced — aborting pipeline.")
        return

    # Step 2: Build messages and run LLM
    print("─── Step 2: LLM ───")
    messages = [
        {"role": "system", "content": system_prompt or "You are a helpful voice assistant. Keep responses concise and conversational."},
        {"role": "user", "content": text},
    ]
    start = time.perf_counter()
    response = await pipeline.llm.complete(messages, temperature=0.7, max_tokens=256)
    llm_elapsed = time.perf_counter() - start
    print(f"  ⏱  {_format_duration(llm_elapsed)}")
    print(f"  🤖 {response}")
    print()

    # Step 3: TTS
    print("─── Step 3: TTS ───")
    start = time.perf_counter()
    audio = await pipeline.tts.synthesize(
        text=response,
        voice_id=settings.DEFAULT_VOICE_ID,
        language=language,
    )
    tts_elapsed = time.perf_counter() - start
    print(f"  ⏱  {_format_duration(tts_elapsed)}")
    print(f"  🔊 {len(audio):,} bytes")

    if args.output:
        with open(args.output, "wb") as f:
            f.write(audio)
        print(f"  💾 Saved to: {args.output}")
    print()

    # Summary
    total = stt_elapsed + llm_elapsed + tts_elapsed
    print(f"─── Pipeline Summary ───")
    print(f"  STT: {_format_duration(stt_elapsed)}")
    print(f"  LLM: {_format_duration(llm_elapsed)}")
    print(f"  TTS: {_format_duration(tts_elapsed)}")
    print(f"  ─────────────────────")
    print(f"  Total: {_format_duration(total)}")

    return {
        "transcription": text,
        "response": response,
        "audio_size": len(audio),
    }


async def cmd_benchmark(args):
    """Benchmark pipeline latency across multiple iterations."""
    from app.config import settings
    from app.voice import get_voice_pipeline

    _init_registry()
    pipeline = get_voice_pipeline()

    audio_data = _load_wav(args.file)
    language = args.language or "en"
    iterations = args.iterations

    print(f"\n  Benchmark: {iterations} iterations")
    print(f"  File: {args.file} ({len(audio_data):,} bytes)")
    print(f"  STT: {pipeline.stt.provider_name}")
    print(f"  LLM: {pipeline.llm.provider_name}")
    print(f"  TTS: {pipeline.tts.provider_name}")
    print()

    stt_times = []
    llm_times = []
    tts_times = []
    total_times = []

    for i in range(iterations):
        print(f"  Iteration {i+1}/{iterations}...", end=" ", flush=True)

        try:
            # STT
            t0 = time.perf_counter()
            text = await pipeline.stt.transcribe(audio_data, language=language)
            t1 = time.perf_counter()
            stt_times.append(t1 - t0)

            if not text.strip():
                print("SKIP (no transcription)")
                continue

            # LLM
            messages = [
                {"role": "system", "content": "You are a helpful voice assistant."},
                {"role": "user", "content": text},
            ]
            response = await pipeline.llm.complete(messages, temperature=0.7, max_tokens=128)
            t2 = time.perf_counter()
            llm_times.append(t2 - t1)

            # TTS
            audio = await pipeline.tts.synthesize(
                text=response,
                voice_id=settings.DEFAULT_VOICE_ID,
                language=language,
            )
            t3 = time.perf_counter()
            tts_times.append(t3 - t2)
            total_times.append(t3 - t0)

            print(f"OK ({_format_duration(t3 - t0)})")

        except Exception as e:
            print(f"FAIL: {e}")

    print()
    print(f"─── Benchmark Results ({iterations} iterations) ───")

    if stt_times:
        print(f"  STT:  avg={_format_duration(sum(stt_times)/len(stt_times))} "
              f"min={_format_duration(min(stt_times))} "
              f"max={_format_duration(max(stt_times))}")
    if llm_times:
        print(f"  LLM:  avg={_format_duration(sum(llm_times)/len(llm_times))} "
              f"min={_format_duration(min(llm_times))} "
              f"max={_format_duration(max(llm_times))}")
    if tts_times:
        print(f"  TTS:  avg={_format_duration(sum(tts_times)/len(tts_times))} "
              f"min={_format_duration(min(tts_times))} "
              f"max={_format_duration(max(tts_times))}")
    if total_times:
        print(f"  Total: avg={_format_duration(sum(total_times)/len(total_times))} "
              f"min={_format_duration(min(total_times))} "
              f"max={_format_duration(max(total_times))}")


async def cmd_list_providers(args):
    """List all registered providers."""
    registry = _init_registry()

    providers = registry.all_providers()
    print()
    print("─── Registered Providers ───")
    print(f"  STT: {', '.join(providers['stt']) or 'none'}")
    print(f"  LLM: {', '.join(providers['llm']) or 'none'}")
    print(f"  TTS: {', '.join(providers['tts']) or 'none'}")
    print()

    from app.config import settings
    print("─── Active Providers ───")
    print(f"  STT: {settings.STT_PROVIDER}")
    print(f"  LLM: {settings.LLM_PROVIDER}")
    print(f"  TTS: {settings.TTS_PROVIDER}")
    print()


# ── Main CLI ────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="VoiceAI Pipeline CLI Test Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # transcribe
    p = subparsers.add_parser("transcribe", help="Transcribe a WAV file")
    p.add_argument("file", help="Path to WAV file")
    p.add_argument("--language", default="en", help="Language code (default: en)")
    p.add_argument("--provider", help="STT provider override")

    # complete
    p = subparsers.add_parser("complete", help="Send a prompt to the LLM")
    p.add_argument("text", help="Input text prompt")
    p.add_argument("--system", help="System prompt override")
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--max-tokens", type=int, default=256)

    # synthesize
    p = subparsers.add_parser("synthesize", help="Synthesize text to speech")
    p.add_argument("text", help="Text to synthesize")
    p.add_argument("--voice", help="Voice ID override")
    p.add_argument("--language", help="Language override")
    p.add_argument("--output", "-o", default="output.wav", help="Output WAV path")

    # pipeline
    p = subparsers.add_parser("pipeline", help="Run full STT→LLM→TTS pipeline")
    p.add_argument("file", help="Path to WAV file")
    p.add_argument("--language", default="en", help="Language code")
    p.add_argument("--system", help="System prompt override")
    p.add_argument("--output", "-o", help="Output WAV path for TTS result")

    # benchmark
    p = subparsers.add_parser("benchmark", help="Benchmark pipeline latency")
    p.add_argument("file", help="Path to WAV file")
    p.add_argument("--iterations", type=int, default=3, help="Number of iterations")
    p.add_argument("--language", default="en", help="Language code")

    # list
    p = subparsers.add_parser("list", help="List registered providers")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    commands = {
        "transcribe": cmd_transcribe,
        "complete": cmd_complete,
        "synthesize": cmd_synthesize,
        "pipeline": cmd_pipeline,
        "benchmark": cmd_benchmark,
        "list": cmd_list_providers,
    }

    cmd = commands[args.command]
    asyncio.run(cmd(args))


if __name__ == "__main__":
    main()
