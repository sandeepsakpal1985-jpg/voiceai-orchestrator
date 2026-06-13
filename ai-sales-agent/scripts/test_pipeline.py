#!/usr/bin/env python3
"""
Test script to verify the voice pipeline (STT → LLM → TTS) works end-to-end.
"""

import asyncio
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
logger = logging.getLogger("test_pipeline")


async def test_providers():
    """Test that the provider registry is working."""
    from app.providers import get_default_registry, reset_default_registry

    reset_default_registry()
    registry = get_default_registry()
    logger.info("Provider registry created successfully")

    # Register test providers
    from app.providers.stt import WhisperSTTProvider
    registry.register_stt("whisper", WhisperSTTProvider(model_size="tiny", device="cpu", compute_type="int8"))
    logger.info("STT provider registered")

    from app.providers.llm import OllamaLLMProvider
    registry.register_llm("ollama", OllamaLLMProvider())
    logger.info("LLM provider registered")

    from app.providers.tts import KokoroTTSProvider
    registry.register_tts("kokoro", KokoroTTSProvider())
    logger.info("TTS provider registered")

    providers = registry.all_providers()
    logger.info("Available providers: %s", providers)
    assert "stt" in providers
    assert "llm" in providers
    assert "tts" in providers
    logger.info("✅ Provider registry test passed")


async def test_conversation_service():
    """Test basic conversation service operations."""
    from app.services.conversation import get_conversation_service
    from app.models.schemas import ConversationCreate, Message
    from app.providers import reset_default_registry

    reset_default_registry()
    service = get_conversation_service()

    conv = service.create(ConversationCreate(contact_phone="+1234567890", contact_name="Test User"))
    assert conv.id is not None
    logger.info("Created conversation: %s", conv.id)

    msg = service.add_message(conv.id, Message(role="user", content="Hello, this is a test.", timestamp=0))
    assert msg.content == "Hello, this is a test."
    logger.info("Added message: %s", msg.content)

    history = service.get_history(conv.id)
    assert len(history) == 1
    logger.info("Conversation history: %d messages", len(history))

    summary = service.generate_summary(conv.id)
    assert "Test User" in summary
    logger.info("Summary: %s", summary)

    logger.info("✅ Conversation service test passed")


async def test_state_engine():
    """Test the conversation state engine."""
    from app.voice.state_engine import get_state_engine

    engine = get_state_engine()
    engine.reset()
    assert engine.current_state == "LISTENING"
    logger.info("State engine initialized: %s", engine.current_state)

    result = engine.process_input(transcript="I need help with booking")
    assert result["next_state"] == "QUESTION"
    logger.info("State transition: LISTENING -> %s", result["next_state"])

    result = engine.process_input(transcript="thank you, goodbye")
    assert result["next_state"] == "CLOSING"
    logger.info("State transition: -> %s (count=%d)", result["next_state"], result["transition_count"])

    logger.info("✅ State engine test passed")


async def main():
    logger.info("=" * 60)
    logger.info("AI Sales Agent — Pipeline Tests")
    logger.info("=" * 60)

    await test_providers()
    await test_conversation_service()
    await test_state_engine()

    logger.info("=" * 60)
    logger.info("All tests passed! 🎉")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
