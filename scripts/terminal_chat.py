#!/usr/bin/env python3
"""
VoiceAI Terminal Chat - Type or speak, hear AI responses spoken aloud.

An interactive REPL that uses the configured LLM + TTS + STT providers to create
a conversational experience entirely in the terminal. Supports keyboard input,
fixed-duration mic recording, and continuous voice-activated recording.

Usage:
    python scripts/terminal_chat.py

Features:
    - Type text -> AI responds with voice
    - /voice [sec] -> record from mic for N seconds -> transcribe -> AI responds
    - /record      -> continuous recording with VAD (stops when you stop speaking)
    - /lang [code] -> switch STT/TTS language on the fly
    - /export      -> save conversation transcript to a file
    - Streaming LLM responses - text appears as it's generated
    - Auto-summarization - keeps long conversations within context limits

Environment Variables (via .env):
    LLM_PROVIDER  -- ollama (default) or openai
    TTS_PROVIDER  -- kokoro (default) or elevenlabs
    STT_PROVIDER  -- whisper (default)
    See .env for full configuration
"""

import asyncio
import datetime
import os
import sys
import threading
import time
from io import BytesIO
from pathlib import Path

# Add project root to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import sounddevice as sd
import soundfile as sf


# -- Constants ----------------------------------------------------------------

SAMPLE_RATE = 16000  # Hz - standard for Whisper

# VAD (Voice Activity Detection) defaults
VAD_CHUNK_DURATION = 0.1       # 100 ms per chunk
VAD_SILENCE_THRESHOLD = 0.02   # RMS energy threshold for silence
VAD_SILENCE_TIMEOUT = 1.5      # seconds of silence before stopping
VAD_MAX_DURATION = 60.0        # absolute max recording time

# Context management
CONTEXT_MAX_TOKENS = 2000       # threshold before summarization kicks in
CONTEXT_KEEP_RECENT = 4        # exchanges to preserve verbatim


# -- Provider Initialization --------------------------------------------------


def _init_registry():
    """Initialize the provider registry with all available providers."""
    from app.providers import get_default_registry, reset_default_registry
    from app.providers.llm.ollama_real import OllamaLLMProvider
    from app.providers.tts.kokoro_provider import KokoroTTSProvider
    from app.providers.stt.whisper import WhisperSTTProvider
    from app.config import settings

    reset_default_registry()
    registry = get_default_registry()

    # -- STT Providers --

    registry.register_stt("whisper", WhisperSTTProvider(
        model_size=settings.WHISPER_MODEL_SIZE,
        device=settings.WHISPER_DEVICE,
        compute_type=settings.WHISPER_COMPUTE_TYPE,
        cpu_threads=settings.WHISPER_CPU_THREADS,
    ))
    print("  [OK] Whisper STT provider registered")

    deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
    if deepgram_key:
        try:
            from app.providers.stt.deepgram_real import DeepgramSTTProvider
            registry.register_stt("deepgram", DeepgramSTTProvider(api_key=deepgram_key))
            print("  [OK] Deepgram STT provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register Deepgram: {e}")

    # -- LLM Providers --

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

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if gemini_key:
        try:
            from app.providers.llm.gemini_provider import GeminiLLMProvider
            registry.register_llm("gemini", GeminiLLMProvider(api_key=gemini_key))
            print("  [OK] Gemini LLM provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register Gemini: {e}")

    # -- TTS Providers --

    registry.register_tts("kokoro", KokoroTTSProvider())

    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
    if elevenlabs_key:
        try:
            from app.providers.tts.elevenlabs_real import ElevenLabsTTSProvider
            registry.register_tts("elevenlabs", ElevenLabsTTSProvider(api_key=elevenlabs_key))
            print("  [OK] ElevenLabs TTS provider registered")
        except Exception as e:
            print(f"  [WARN] Failed to register ElevenLabs: {e}")


# -- Audio Utilities -----------------------------------------------------------


def numpy_to_wav(audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Convert a numpy float32 array to WAV bytes."""
    buffer = BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


async def record_from_mic(duration: float) -> bytes:
    """Record audio from the default microphone for a fixed duration."""
    def _record():
        recording = sd.rec(
            int(duration * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocking=True,
        )
        return recording.flatten()

    print(f"  [Mic] Recording for {duration:.0f}s... ", end="", flush=True)
    audio = await asyncio.to_thread(_record)
    print("done!")
    return numpy_to_wav(audio)


async def _transcribe_from_wav(stt, wav_bytes: bytes, language: str) -> str | None:
    """Transcribe WAV bytes and print timing. Returns None on failure/empty."""
    if not wav_bytes:
        return None
    print("  [STT] Transcribing...", end=" ", flush=True)
    t0 = time.perf_counter()
    try:
        text = await stt.transcribe(wav_bytes, language=language)
    except Exception as e:
        print(f"\n  [STT Error] {e}")
        return None
    t1 = time.perf_counter()
    print(f"({t1 - t0:.1f}s)")
    if not text.strip():
        print("  (no speech detected)")
        return None
    print(f"  [You] {text}")
    return text


async def record_until_silence(
    *,
    sample_rate: int = SAMPLE_RATE,
    chunk_duration: float = VAD_CHUNK_DURATION,
    silence_threshold: float = VAD_SILENCE_THRESHOLD,
    silence_timeout: float = VAD_SILENCE_TIMEOUT,
    max_duration: float = VAD_MAX_DURATION,
) -> bytes:
    """Record from microphone with Voice Activity Detection.

    Continuously records until the user stops speaking for
    ``silence_timeout`` seconds, or ``max_duration`` is reached.

    Returns WAV audio bytes.
    """
    chunk_samples = int(sample_rate * chunk_duration)
    silence_chunks_needed = int(silence_timeout / chunk_duration)
    total_chunks_limit = int(max_duration / chunk_duration)

    audio_chunks: list[np.ndarray] = []
    stop_event = threading.Event()

    def _record_loop():
        silent_chunks = 0

        def callback(indata, frames, time_info, status):
            nonlocal silent_chunks
            if status:
                return
            if len(audio_chunks) >= total_chunks_limit:
                stop_event.set()
                raise sd.CallbackStop()

            rms = float(np.sqrt(np.mean(indata ** 2)))
            audio_chunks.append(indata.copy())

            if rms < silence_threshold:
                silent_chunks += 1
                if silent_chunks >= silence_chunks_needed:
                    stop_event.set()
                    raise sd.CallbackStop()
            else:
                silent_chunks = 0

        with sd.InputStream(
            samplerate=sample_rate,
            channels=1,
            dtype="float32",
            callback=callback,
            blocksize=chunk_samples,
        ):
            stop_event.wait()

    print("  [Mic] Listening (speak now)...", flush=True)
    await asyncio.to_thread(_record_loop)

    if not audio_chunks:
        print("  (no audio captured)")
        return b""

    audio = np.concatenate(audio_chunks).flatten()
    duration = len(audio) / sample_rate
    print(f"  [Mic] Captured {duration:.1f}s of audio")
    return numpy_to_wav(audio)


async def play_wav(audio_bytes: bytes):
    """Play WAV audio bytes using sounddevice (non-blocking via executor)."""
    def _play():
        try:
            data, sr = sf.read(BytesIO(audio_bytes))
            sd.play(data, sr)
            sd.wait()
        except Exception as e:
            print(f"  [Audio Error] {e}")

    await asyncio.to_thread(_play)


# -- Streaming LLM Response ---------------------------------------------------


async def stream_llm_response(
    llm,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 256,
) -> str:
    """Stream the LLM response with a typewriter effect.

    Falls back to non-streaming if the provider doesn't support it.
    Returns the full response text.
    """
    full = ""
    if llm.supports_streaming:
        try:
            async for chunk in llm.complete_stream(
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ):
                full += chunk
                print(chunk, end="", flush=True)
            print()
            return full
        except NotImplementedError:
            pass
        except Exception:
            pass

    # Non-streaming fallback
    response = await llm.complete(messages, temperature=temperature, max_tokens=max_tokens)
    print(response)
    return response


# -- Context Management -------------------------------------------------------


async def maybe_summarize(
    llm,
    messages: list[dict],
    max_tokens: float = CONTEXT_MAX_TOKENS,
    keep_recent: int = CONTEXT_KEEP_RECENT,
) -> list[dict]:
    """If the conversation exceeds ``max_tokens``, summarize older messages.

    The system prompt and the ``keep_recent`` most recent exchanges are
    preserved verbatim. Everything before that is replaced with a single
    system message carrying a concise LLM-generated summary.
    """
    # Rough token estimate: ~1.3 tokens per English word
    total = sum(len(m.get("content", "").split()) * 1.3 for m in messages)

    if total <= max_tokens:
        return messages

    # Separate system prompt
    system = None
    start = 0
    if messages and messages[0].get("role") == "system":
        system = messages[0]
        start = 1

    # Not enough turns to bother summarising
    if len(messages) - start <= keep_recent:
        return messages

    to_summarize = messages[start:-keep_recent]
    recent = messages[-keep_recent:]

    # Build a plain-text transcript of the older messages
    transcript = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in to_summarize
    )

    summary_prompt = [
        {
            "role": "system",
            "content": (
                "Summarise the following conversation concisely. "
                "Capture the key topics, intents, and any important information "
                "the user has shared. Keep it under 100 words."
            ),
        },
        {"role": "user", "content": transcript},
    ]

    try:
        summary = await llm.complete(summary_prompt, temperature=0.3, max_tokens=150)
        summary = summary.strip()
    except Exception:
        summary = "(conversation history truncated)"

    # Rebuild messages: system -> summary -> recent history
    new_messages: list[dict] = []
    if system:
        new_messages.append(system)
    new_messages.append({
        "role": "system",
        "content": f"Earlier conversation context: {summary}",
    })
    new_messages.extend(recent)

    return new_messages


# -- Export --------------------------------------------------------------------


def format_transcript(messages: list[dict]) -> str:
    """Format the conversation messages into a readable text transcript."""
    lines: list[str] = []
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines.append(f"VoiceAI Chat Transcript - {timestamp}")
    lines.append("=" * 60)
    lines.append("")

    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")

        if role == "system":
            lines.append(f"[System] {content}")
        elif role == "user":
            lines.append(f"You: {content}")
        elif role == "assistant":
            lines.append(f"AI:  {content}")

        lines.append("")

    lines.append("=" * 60)
    lines.append("End of transcript.")
    return "\n".join(lines)


async def export_conversation(messages: list[dict], path: str | None = None) -> str:
    """Write conversation transcript to a file.

    Args:
        messages: The conversation messages.
        path: Optional file path. Auto-generates one if not provided.

    Returns:
        The path the transcript was written to.
    """
    if path is None:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        path = f"chat_log_{timestamp}.txt"

    transcript = format_transcript(messages)

    def _write():
        with open(path, "w", encoding="utf-8") as f:
            f.write(transcript)

    await asyncio.to_thread(_write)
    return path


# -- Language helper -----------------------------------------------------------


# Map common language names/codes to Whisper-compatible codes
LANGUAGE_ALIASES: dict[str, str] = {
    "en": "en", "english": "en",
    "es": "es", "spanish": "es",
    "fr": "fr", "french": "fr",
    "de": "de", "german": "de",
    "it": "it", "italian": "it",
    "pt": "pt", "portuguese": "pt",
    "nl": "nl", "dutch": "nl",
    "ru": "ru", "russian": "ru",
    "zh": "zh", "chinese": "zh", "mandarin": "zh",
    "ja": "ja", "japanese": "ja",
    "ko": "ko", "korean": "ko",
    "ar": "ar", "arabic": "ar",
    "hi": "hi", "hindi": "hi",
    "tr": "tr", "turkish": "tr",
    "vi": "vi", "vietnamese": "vi",
    "pl": "pl", "polish": "pl",
    "uk": "uk", "ukrainian": "uk",
    "th": "th", "thai": "th",
}

LANGUAGE_DISPLAY: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "ru": "Russian",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "pl": "Polish",
    "uk": "Ukrainian",
    "th": "Thai",
}


def resolve_language(raw: str) -> str | None:
    """Resolve a user-supplied language string to a Whisper language code.

    Returns None if unrecognised.
    """
    code = raw.strip().lower()
    if code in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[code]
    # Try as-is - Whisper accepts many codes directly
    if len(code) == 2 and code.isalpha():
        return code
    return None


def display_language(code: str) -> str:
    """Human-readable language name for the banner."""
    return LANGUAGE_DISPLAY.get(code, code.upper())


# -- Main Chat Loop ------------------------------------------------------------


async def main():
    from app.config import settings
    from app.providers import get_default_registry

    print()
    print("=" * 60)
    print("  [AI] VoiceAI - Terminal Chat")
    print("  Type or speak, and the AI talks back")
    print("=" * 60)
    print()

    print("  Initializing providers...")
    _init_registry()
    registry = get_default_registry()
    print()

    llm = registry.get_llm(settings.LLM_PROVIDER)
    tts = registry.get_tts(settings.TTS_PROVIDER)
    stt = registry.get_stt(settings.STT_PROVIDER)

    # Active language (can be changed at runtime via /lang)
    language: str = settings.DEFAULT_LANGUAGE

    print(f"  LLM  Provider: {llm.provider_name}")
    print(f"  TTS  Provider: {tts.provider_name}")
    print(f"  STT  Provider: {stt.provider_name}")
    print(f"  Voice:         {settings.DEFAULT_VOICE_ID}")
    print(f"  Language:      {display_language(language)}")
    print(f"  Streaming:     {'yes' if llm.supports_streaming else 'no'}")
    print()
    print("  Commands:")
    print("    /quit  /exit  /bye         - end session")
    print("    /voice [seconds]           - record mic (fixed duration)")
    print("    /record                    - record with VAD (stops on silence)")
    print("    /lang [code]               - switch language (e.g. /lang es)")
    print("    /export [filename]         - save transcript to file")
    print("    /reset                     - clear conversation history")
    print("    /help                      - show this help")
    print()
    print("-" * 60)

    system_prompt = (
        "You are a friendly and professional AI voice assistant. "
        "Keep responses concise and conversational - as if you're talking "
        "to a friend on the phone. Responses should be under 100 words "
        "unless the topic is complex. Speak naturally: avoid bullet points, "
        "lists, markdown, or numbered steps. Use natural transitions and "
        "occasional follow-up questions to keep the conversation flowing."
    )

    messages: list[dict] = [{"role": "system", "content": system_prompt}]

    while True:
        # ── Input ─────────────────────────────────────────────────
        try:
            raw = input("\n  [You] ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n  Goodbye!\n")
            break

        if not raw:
            continue

        # ── Commands ──────────────────────────────────────────────
        if raw.startswith("/"):
            cmd = raw.lower()

            if cmd in ("/quit", "/exit", "/bye"):
                print("  Goodbye!\n")
                break

            if cmd == "/reset":
                messages = [{"role": "system", "content": system_prompt}]
                print("  Conversation history cleared.")
                continue

            if cmd == "/help":
                print("  Commands:")
                print("    /quit  /exit  /bye         - end session")
                print("    /voice [seconds]           - record mic (fixed duration)")
                print("    /record                    - record with VAD (stops on silence)")
                print("    /lang [code]               - switch language (e.g. /lang es)")
                print("    /export [filename]         - save transcript to file")
                print("    /reset                     - clear conversation history")
                print("    /help                      - show this help")
                continue

            if cmd == "/record":
                try:
                    wav_bytes = await record_until_silence()
                except Exception as e:
                    print(f"  [Mic Error] {e}")
                    continue

                user_input = await _transcribe_from_wav(stt, wav_bytes, language)
                if user_input is None:
                    continue

            elif cmd.startswith("/voice"):
                parts = raw.split()
                duration = 5.0
                if len(parts) > 1:
                    try:
                        duration = max(1.0, min(30.0, float(parts[1])))
                    except ValueError:
                        print("  Usage: /voice [seconds] (1-30, default 5)")
                        continue

                try:
                    wav_bytes = await record_from_mic(duration)
                except Exception as e:
                    print(f"  [Mic Error] {e}")
                    continue

                user_input = await _transcribe_from_wav(stt, wav_bytes, language)
                if user_input is None:
                    continue

            elif cmd.startswith("/lang"):
                parts = raw.split()
                if len(parts) < 2:
                    print(f"  Current language: {display_language(language)}")
                    print("  Usage: /lang [code]  (e.g. /lang es, /lang fr, /lang de)")
                    print("  Supported: en es fr de it pt nl ru zh ja ko ar hi tr vi pl uk th")
                    continue

                resolved = resolve_language(parts[1])
                if resolved is None:
                    print(f"  Unrecognised language: {parts[1]}")
                    print("  Try: /lang en  /lang es  /lang fr  /lang de  /lang zh  /lang hi")
                    continue

                language = resolved
                print(f"  [Lang] Language set to {display_language(language)}")
                continue

            elif cmd.startswith("/export"):
                parts = raw.split()
                filepath = parts[1] if len(parts) > 1 else None
                try:
                    saved = await export_conversation(messages, filepath)
                    print(f"  [Export] Transcript saved to: {saved}")
                except Exception as e:
                    print(f"  [Export Error] {e}")
                continue

            else:
                print(f"  Unknown command: {raw}")
                continue

        else:
            user_input = raw

        if not user_input.strip():
            continue

        # ── LLM ───────────────────────────────────────────────────
        messages.append({"role": "user", "content": user_input})

        print("  [AI] ", end="", flush=True)
        try:
            response = await stream_llm_response(
                llm,
                messages,
                temperature=settings.LLM_TEMPERATURE,
                max_tokens=settings.LLM_MAX_TOKENS,
            )
        except Exception as e:
            print(f"\n  [LLM Error] {e}")
            messages.pop()
            continue

        messages.append({"role": "assistant", "content": response})

        # ── Context summarization ─────────────────────────────────
        messages = await maybe_summarize(llm, messages)

        # ── TTS ───────────────────────────────────────────────────
        print(f"  [TTS] Speaking...", end=" ", flush=True)
        t0 = time.perf_counter()
        try:
            audio = await tts.synthesize(
                text=response,
                voice_id=settings.DEFAULT_VOICE_ID,
                language=language,
                speaking_rate=settings.DEFAULT_SPEAKING_RATE,
            )
        except Exception as e:
            print(f"\n  [TTS Error] {e}")
            continue
        t1 = time.perf_counter()
        print(f"({t1 - t0:.1f}s)")

        await play_wav(audio)

    print()


if __name__ == "__main__":
    asyncio.run(main())
