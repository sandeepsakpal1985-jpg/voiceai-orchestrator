"""Tests for the conversation service."""

import pytest
from app.services.conversation import ConversationService
from app.models.schemas import ConversationCreate, Message


@pytest.fixture
def service():
    return ConversationService()


@pytest.mark.asyncio
async def test_create_conversation(service):
    conv = service.create(ConversationCreate(contact_phone="+1234567890", contact_name="Test User"))
    assert conv.id is not None
    assert conv.contact_phone == "+1234567890"
    assert conv.contact_name == "Test User"
    assert conv.status == "in_progress"


@pytest.mark.asyncio
async def test_add_and_get_messages(service):
    conv = service.create(ConversationCreate(contact_phone="+1234567890"))
    msg = service.add_message(conv.id, Message(role="user", content="Hello", timestamp=0))
    assert msg.content == "Hello"
    history = service.get_history(conv.id)
    assert len(history) == 1


@pytest.mark.asyncio
async def test_update_status(service):
    conv = service.create(ConversationCreate(contact_phone="+1234567890"))
    service.update_status(conv.id, "completed")
    assert conv.status == "completed"
    assert conv.ended_at is not None


@pytest.mark.asyncio
async def test_get_nonexistent(service):
    assert service.get("nonexistent") is None


@pytest.mark.asyncio
async def test_delete(service):
    conv = service.create(ConversationCreate(contact_phone="+1234567890"))
    assert service.delete(conv.id) is True
    assert service.get(conv.id) is None


@pytest.mark.asyncio
async def test_sentiment_analysis():
    from app.services.conversation import ConversationService
    label, score = ConversationService.analyze_sentiment("This is great! Thank you!")
    assert label in ("positive", "very_positive")
    assert score > 0
    label, score = ConversationService.analyze_sentiment("This is terrible and frustrating")
    assert label in ("negative", "very_negative")
    assert score < 0
    label, score = ConversationService.analyze_sentiment("The weather is fine")
    assert label == "neutral"
    assert score == 0.0
