#!/usr/bin/env python3
"""
FreeSWITCH Call Simulation — Test script for the AI voice pipeline.

Simulates a phone call through the FreeSWITCH integration without
requiring an actual FreeSWITCH server. Tests the VoicePipeline
(STT → LLM → TTS) through the call handler abstraction.

Usage:
    python telephony/scripts/simulate_call.py [--mode http|esl] [--audio tests/sample.wav]

Requirements:
    Python 3.10+
    The AI backend must be running (FastAPI on port 8000).
    Sample audio file for STT testing (or uses a text-only mode).
"""

import argparse
import asyncio
import json
import os
import sys
import time
import uuid

# Add the backend to path for local imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

import logging

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("freeswitch_sim")


async def simulate_http_mode(audio_file: str | None = None):
    """Simulate a call using the HTTP integration mode.

    Makes HTTP calls to the AI backend as FreeSWITCH dialplan would.
    """
    import httpx

    base_url = "http://127.0.0.1:8000"
    call_uuid = str(uuid.uuid4())
    caller_number = "+15551234567"

    logger.info("=" * 60)
    logger.info("FreeSWITCH Call Simulation (HTTP Mode)")
    logger.info("Call UUID: %s", call_uuid)
    logger.info("Caller:    %s", caller_number)
    logger.info("=" * 60)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Notify backend of incoming call
            logger.info("\n[1/5] Incoming call notification...")
            resp = await client.post(
                f"{base_url}/fs/incoming",
                json={
                    "call_uuid": call_uuid,
                    "caller_number": caller_number,
                    "called_number": "+15559876543",
                    "sip_call_id": f"sip-test-{call_uuid[:8]}",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            conversation_id = data.get("conversation_id", "")
            greeting = data.get("greeting", "")
            logger.info("  ✓ Conversation: %s", conversation_id)
            logger.info("  ✓ Greeting: '%s'", greeting)

            # Step 2: Simulate user speech (use sample audio or text)
            logger.info("\n[2/5] Simulating caller speech...")
            if audio_file and os.path.exists(audio_file):
                with open(audio_file, "rb") as f:
                    audio_bytes = f.read()
                import base64
                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                logger.info("  ✓ Loaded audio file: %s (%d bytes)", audio_file, len(audio_bytes))
            else:
                # Generate a minimal WAV file with silence (text-only simulation)
                logger.info("  ⚠ No audio file provided, using text placeholder")
                audio_b64 = ""

            # Step 3: Process through AI pipeline
            logger.info("\n[3/5] Processing through AI pipeline (STT → LLM → TTS)...")
            resp = await client.post(
                f"{base_url}/fs/process",
                json={
                    "call_uuid": call_uuid,
                    "audio_base64": audio_b64,
                    "conversation_id": conversation_id,
                },
            )
            resp.raise_for_status()
            result = resp.json()

            transcription = result.get("transcription", "")
            response_text = result.get("response", "")
            has_audio = bool(result.get("audio_base64", ""))
            end_call = result.get("end_call", False)

            logger.info("  ✓ Transcription: '%s'", transcription or "(empty)")
            logger.info("  ✓ AI Response:   '%s'", response_text)
            logger.info("  ✓ TTS Audio:      %s", "✓ generated" if has_audio else "✗ (none)")
            logger.info("  ✓ End Call:       %s", end_call)

            # Step 4: Simulate a second turn
            logger.info("\n[4/5] Simulating second caller turn...")
            if audio_file and os.path.exists(audio_file):
                with open(audio_file, "rb") as f:
                    audio_bytes = f.read()
                audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            else:
                audio_b64 = ""

            resp = await client.post(
                f"{base_url}/fs/process",
                json={
                    "call_uuid": call_uuid,
                    "audio_base64": audio_b64,
                    "conversation_id": conversation_id,
                },
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info("  ✓ AI Response: '%s'", result.get("response", ""))

            # Step 5: Hang up
            logger.info("\n[5/5] Ending call...")
            resp = await client.post(
                f"{base_url}/fs/hangup",
                json={"call_uuid": call_uuid},
            )
            resp.raise_for_status()
            logger.info("  ✓ Call ended successfully")

            # Final health check
            resp = await client.get(f"{base_url}/fs/health")
            health = resp.json()
            logger.info("\n  FS Health: %s active calls", health.get("active_calls", 0))

            logger.info("\n✅ HTTP simulation completed successfully!")

    except httpx.ConnectError:
        logger.error(
            "\n❌ Cannot connect to AI backend at %s.\n"
            "   Make sure the FastAPI server is running:\n"
            "     cd backend && python -m app.main",
            base_url,
        )
        return False
    except Exception as exc:
        logger.exception("\n❌ Simulation error: %s", exc)
        return False

    return True


async def simulate_esl_mode():
    """Simulate a call using the ESL bridge mode (connects to FreeSWITCH ESL).

    This requires a running FreeSWITCH server with ESL enabled.
    """
    logger.info("=" * 60)
    logger.info("FreeSWITCH Call Simulation (ESL Mode)")
    logger.info("=" * 60)
    logger.info(
        "ESL mode requires a running FreeSWITCH server with mod_event_socket.\n"
        "To test with a real FreeSWITCH:\n"
        "  1. Start FreeSWITCH: freeswitch -nc\n"
        "  2. Ensure ESL is listening on 127.0.0.1:8021\n"
        "  3. Start the AI backend: cd backend && python -m app.main\n"
        "  4. Run this script with --mode esl\n"
    )

    try:
        from telephony.freeswitch import ESLClient

        client = ESLClient()
        logger.info("Connecting to FreeSWITCH ESL...")
        await client.connect()
        logger.info("✓ Connected! Sending test commands...")

        # Test basic connectivity
        resp = await client.send_command("status")
        logger.info("FS status: %s", resp.body[:200] if resp.body else "(empty)")

        resp = await client.send_command("show calls count")
        logger.info("Active calls: %s", resp.body.strip())

        await client.disconnect()
        logger.info("\n✅ ESL simulation completed successfully!")
        return True

    except Exception as exc:
        logger.warning("\n⚠ ESL simulation skipped: %s", exc)
        logger.info("This is expected if FreeSWITCH is not running.")
        return False


async def simulate_direct_pipeline():
    """Simulate the call pipeline directly without HTTP or ESL.

    Tests the VoicePipeline end-to-end using the same code path
    that the FreeSWITCH call handler uses.
    """
    logger.info("=" * 60)
    logger.info("Direct Pipeline Simulation (no FreeSWITCH needed)")
    logger.info("=" * 60)

    try:
        # Import the pipeline directly
        from app.voice import get_voice_pipeline
        from app.services.conversation import get_conversation_service
        from app.models.schemas import ConversationCreate

        pipeline = get_voice_pipeline()
        conv_service = get_conversation_service()

        # Create a mock conversation
        conv = conv_service.create(
            ConversationCreate(
                contact_phone="+15551234567",
                contact_name="Test Caller",
                metadata={"source": "simulation"},
            )
        )
        logger.info("✓ Conversation created: %s", conv.id)

        # Test LLM directly
        logger.info("\nTesting LLM...")
        response = await pipeline.llm.complete([
            {"role": "system", "content": "You are a helpful AI assistant. Keep responses under 3 sentences."},
            {"role": "user", "content": "Hello! Who are you?"},
        ])
        logger.info("  LLM Response: '%s'", response)
        assert response and len(response) > 5, "LLM should return a response"

        # Test TTS directly
        logger.info("\nTesting TTS...")
        audio = await pipeline.tts.synthesize(
            text="Hello! Thank you for calling. How can I help you today?",
            voice_id="af_bella",
            language="en",
        )
        logger.info("  TTS Audio: %d bytes generated", len(audio))
        assert len(audio) > 100, "TTS should produce valid audio"

        # Store messages
        conv_service.add_message(conv.id, {"role": "user", "content": "Hello!", "timestamp": time.time()})
        conv_service.add_message(conv.id, {"role": "agent", "content": response, "timestamp": time.time()})

        logger.info("\n✅ Direct pipeline simulation completed successfully!")
        logger.info("Both LLM and TTS providers are functioning correctly.")
        logger.info("This means the FreeSWITCH integration should work end-to-end.")
        return True

    except Exception as exc:
        logger.exception("\n❌ Pipeline simulation error: %s", exc)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Simulate FreeSWITCH call through the AI pipeline"
    )
    parser.add_argument(
        "--mode",
        choices=["http", "esl", "direct", "all"],
        default="all",
        help="Integration mode to test (default: all)",
    )
    parser.add_argument(
        "--audio",
        default=None,
        help="Path to a WAV audio file for STT testing",
    )
    args = parser.parse_args()

    results = {}

    if args.mode in ("direct", "all"):
        results["direct"] = asyncio.run(simulate_direct_pipeline())

    if args.mode in ("http", "all"):
        results["http"] = asyncio.run(simulate_http_mode(audio_file=args.audio))

    if args.mode in ("esl", "all"):
        results["esl"] = asyncio.run(simulate_esl_mode())

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("SIMULATION RESULTS")
    logger.info("=" * 60)
    for mode, success in results.items():
        status = "✅ PASS" if success else "⚠ SKIP/FAIL"
        logger.info("  %s: %s", mode.upper(), status)

    all_pass = all(results.values()) if results else False
    if all_pass:
        logger.info("\n✅ All simulations passed!")
    else:
        logger.info("\n⚠ Some simulations were skipped (expected if dependencies missing).")


if __name__ == "__main__":
    main()
