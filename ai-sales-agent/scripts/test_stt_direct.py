#!/usr/bin/env python3
"""Test STT pipeline directly with a generated WAV file."""
import struct
import wave
import sys
import os

# Generate a 2-second tone at 440Hz (A4), 16kHz, 16-bit mono
SAMPLE_RATE = 16000
DURATION = 2.0
FREQ = 440.0  # A4 tone
AMPLITUDE = 0.5

num_samples = int(SAMPLE_RATE * DURATION)
samples = []
for i in range(num_samples):
    t = i / SAMPLE_RATE
    # Mix tone with some noise to simulate speech-like audio
    import random
    sample = int(AMPLITUDE * 32767 * (0.7 * (2**0.5) * __import__('math').sin(2 * __import__('math').pi * FREQ * t) + 0.3 * random.random()))
    samples.append(max(-32768, min(32767, sample)))

# Write WAV file
wav_path = "/tmp/test_audio.wav"
with wave.open(wav_path, "w") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    wav.writeframes(struct.pack(f"<{len(samples)}h", *samples))

print(f"Generated WAV file: {wav_path}")
print(f"File size: {os.path.getsize(wav_path)} bytes")
print(f"Duration: {DURATION}s at {SAMPLE_RATE}Hz, 16-bit mono")

# Read the WAV bytes
with open(wav_path, "rb") as f:
    wav_bytes = f.read()

print(f"\nWAV bytes length: {len(wav_bytes)}")

# Now test via the backend's health endpoint
import urllib.request
import json

# First check backend is up
try:
    resp = urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=5)
    data = json.loads(resp.read())
    print(f"\nBackend status: {data['status']}")
    print(f"STT providers: {data['providers']['stt']}")
except Exception as e:
    print(f"\n❌ Backend not accessible: {e}")
    sys.exit(1)

# Now test STT via the voice pipeline API
# We'll use the /voice endpoint if it exists, or directly import the pipeline
print("\n=== Testing STT via direct pipeline call ===")

sys.path.insert(0, "/opt/ai-sales-agent/backend")
os.chdir("/opt/ai-sales-agent/backend")

os.environ["FREESWITCH_BRIDGE_ENABLED"] = "false"
os.environ["REDIS_URL"] = ""
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:11434"
os.environ["OLLAMA_MODEL"] = "qwen2.5:1.5b"
os.environ["STT_PROVIDER"] = "whisper"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["TTS_PROVIDER"] = "kokoro"
os.environ["WHISPER_MODEL_SIZE"] = "tiny"

import asyncio

async def test_stt():
    from app.providers import get_default_registry
    from app.config import settings
    
    registry = get_default_registry()
    stt = registry.get_stt("whisper")
    
    print(f"\nSTT Provider: {stt.provider_name}")
    print("Transcribing test audio...")
    
    try:
        result = await asyncio.wait_for(
            stt.transcribe(wav_bytes, language="en"),
            timeout=60
        )
        print(f"✅ Transcription result: '{result}'")
        if result.strip():
            print("✓ STT WORKS!")
        else:
            print("⚠️ STT returned empty - test tone might not contain speech-like content")
    except asyncio.TimeoutError:
        print("❌ STT timed out after 60 seconds")
    except Exception as e:
        print(f"❌ STT error: {e}")

asyncio.run(test_stt())
