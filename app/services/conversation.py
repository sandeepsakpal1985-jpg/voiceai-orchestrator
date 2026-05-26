"""
Conversation Service — Manages conversation state, history, and sentiment analysis.

This service is the Python equivalent of the Next.js conversation.ts module.
It uses in-memory storage with automatic TTL-based cleanup for completed/failed conversations.
"""

import asyncio
import logging
import time
import uuid
from typing import Optional

from app.models.schemas import Message, ConversationCreate, ConversationResponse
from app.providers import get_default_registry
from app.config import settings

logger = logging.getLogger("voiceai.conversation")

DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly and professional AI voice assistant. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions."
)

# ── Constants ───────────────────────────────────────────────────────

# How long completed/failed conversations stay in memory before cleanup
COMPLETED_CONVERSATION_TTL: int = 3600  # 1 hour
# How often the cleanup task runs
CLEANUP_INTERVAL: int = 300  # 5 minutes


class ConversationState:
    """In-memory conversation state with metadata."""

    def __init__(
        self,
        id: str,
        contact_phone: str,
        contact_name: str | None = None,
        campaign_id: str | None = None,
        metadata: dict | None = None,
    ):
        self.id = id
        self.contact_phone = contact_phone
        self.contact_name = contact_name
        self.campaign_id = campaign_id
        self.messages: list[Message] = []
        self.status: str = "initializing"
        self.sentiment_label: str = "neutral"
        self.sentiment_score: float = 0.0
        self.started_at = time.time()
        self.ended_at: float | None = None
        self.metadata = metadata or {}

    @property
    def duration_seconds(self) -> float:
        end = self.ended_at or time.time()
        return end - self.started_at

    @property
    def age_seconds(self) -> float:
        """How old this conversation is (from creation)."""
        return time.time() - self.started_at

    def is_expired(self, ttl: int = COMPLETED_CONVERSATION_TTL) -> bool:
        """Check if this conversation should be evicted from memory."""
        if self.status in ("completed", "failed") and self.ended_at:
            return (time.time() - self.ended_at) > ttl
        return False

    def to_response(self) -> ConversationResponse:
        return ConversationResponse(
            id=self.id,
            contact_name=self.contact_name,
            contact_phone=self.contact_phone,
            status=self.status,
            messages=self.messages,
            sentiment=self.sentiment_label,
            sentiment_score=self.sentiment_score,
            duration_seconds=self.duration_seconds,
            started_at=self.started_at,
            ended_at=self.ended_at,
        )


class ConversationService:
    """Manages all active conversations with automatic TTL-based eviction."""

    def __init__(self, cleanup_interval: int = CLEANUP_INTERVAL):
        self._conversations: dict[str, ConversationState] = {}
        self._cleanup_interval = cleanup_interval
        self._cleanup_task: asyncio.Task | None = None

    async def start_cleanup_task(self) -> None:
        """Start the background task that periodically evicts expired conversations."""
        if self._cleanup_task is not None:
            return

        async def _cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(self._cleanup_interval)
                    evicted = self._evict_expired()
                    if evicted:
                        logger.info(
                            "Evicted %d expired conversations", evicted
                        )
                except asyncio.CancelledError:
                    # Task is being cancelled — graceful exit
                    logger.debug("Conversation cleanup task cancelled")
                    break
                except Exception:
                    logger.exception(
                        "Error in conversation cleanup loop — continuing..."
                    )

        self._cleanup_task = asyncio.create_task(_cleanup_loop())
        logger.info(
            "Conversation cleanup task started (interval=%ds, ttl=%ds)",
            self._cleanup_interval,
            COMPLETED_CONVERSATION_TTL,
        )

    async def stop_cleanup_task(self) -> None:
        """Stop the background cleanup task."""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

    def _evict_expired(self) -> int:
        """Remove expired conversations from memory. Returns count evicted."""
        expired_ids = [
            cid for cid, conv in self._conversations.items()
            if conv.is_expired()
        ]
        for cid in expired_ids:
            del self._conversations[cid]
        return len(expired_ids)

    def create(self, params: ConversationCreate) -> ConversationState:
        """Create a new conversation."""
        conv_id = str(uuid.uuid4())
        state = ConversationState(
            id=conv_id,
            contact_phone=params.contact_phone,
            contact_name=params.contact_name,
            campaign_id=params.campaign_id,
            metadata=params.metadata,
        )
        state.status = "in_progress"
        self._conversations[conv_id] = state
        return state

    def get(self, conversation_id: str) -> ConversationState | None:
        """Get a conversation by ID."""
        return self._conversations.get(conversation_id)

    def add_message(self, conversation_id: str, message: Message) -> Message:
        """Add a message to a conversation."""
        conv = self.get(conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")

        msg = Message(
            role=message.role,
            content=message.content,
            timestamp=message.timestamp or time.time(),
        )
        conv.messages.append(msg)
        return msg

    def update_status(
        self, conversation_id: str, status: str
    ) -> None:
        """Update conversation status."""
        conv = self.get(conversation_id)
        if not conv:
            return
        conv.status = status
        if status in ("completed", "failed"):
            conv.ended_at = time.time()

    def update_sentiment(
        self, conversation_id: str, label: str, score: float
    ) -> None:
        """Update conversation sentiment."""
        conv = self.get(conversation_id)
        if not conv:
            return
        conv.sentiment_label = label
        conv.sentiment_score = score

    def get_all(self, active_only: bool = False) -> list[ConversationState]:
        """Get all conversations, optionally filtered to active ones."""
        convs = list(self._conversations.values())
        if active_only:
            convs = [c for c in convs if c.status in ("initializing", "in_progress")]
        return convs

    def get_history(
        self, conversation_id: str, limit: int = 10
    ) -> list[Message]:
        """Get recent messages from a conversation."""
        conv = self.get(conversation_id)
        if not conv:
            return []
        return conv.messages[-limit:]

    def generate_summary(self, conversation_id: str) -> str:
        """Generate a text summary of a conversation."""
        conv = self.get(conversation_id)
        if not conv or not conv.messages:
            return "No conversation recorded."

        msg_count = len(conv.messages)
        agent_msgs = sum(1 for m in conv.messages if m.role == "agent")
        user_msgs = sum(1 for m in conv.messages if m.role == "user")

        return (
            f"Conversation with {conv.contact_name or conv.contact_phone}. "
            f"{msg_count} messages exchanged ({agent_msgs} agent, {user_msgs} user). "
            f"Duration: {conv.duration_seconds:.0f}s. "
            f"Final sentiment: {conv.sentiment_label} ({conv.sentiment_score:.2f})."
        )

    def delete(self, conversation_id: str) -> bool:
        """Delete a conversation from memory."""
        return self._conversations.pop(conversation_id, None) is not None

    async def process_llm_turn(
        self,
        conversation_id: str,
        user_input: str,
        system_prompt: str | None = None,
        store_conversation: bool = True,
        include_history: bool = True,
        history_limit: int = 4,
    ) -> dict:
        """Process a user input through the full LLM turn pipeline.

        Builds messages with conversation context, calls the LLM,
        stores the exchange in history, and updates sentiment.

        Returns:
            dict with "conversation_id", "response", and optionally "sentiment"
        """
        conv = self.get(conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Lazy import to avoid circular dependency
        from app.voice import get_voice_pipeline  # fmt: skip

        pipeline = get_voice_pipeline()

        # Build messages
        messages = [
            {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT},
        ]

        if include_history:
            history = self.get_history(conversation_id, limit=history_limit)
            for msg in history:
                role = "assistant" if msg.role == "agent" else msg.role
                messages.append({"role": role, "content": msg.content})

        messages.append({"role": "user", "content": user_input})

        # Get LLM response
        response = await pipeline.llm.complete(messages)

        if store_conversation:
            self.add_message(
                conversation_id,
                Message(role="user", content=user_input, timestamp=time.time()),
            )
            self.add_message(
                conversation_id,
                Message(role="agent", content=response, timestamp=time.time()),
            )

            # Update sentiment
            label, score = self.analyze_sentiment(user_input)
            self.update_sentiment(conversation_id, label, score)

        return {
            "conversation_id": conversation_id,
            "response": response,
            "sentiment": {
                "label": conv.sentiment_label if store_conversation else "neutral",
                "score": conv.sentiment_score if store_conversation else 0.0,
            },
        }

    @staticmethod
    def analyze_sentiment(text: str) -> tuple[str, float]:
        """Simple keyword-based sentiment analysis.

        Returns:
            Tuple of (label, score) where label is one of:
            very_positive, positive, neutral, negative, very_negative
        """
        positive_words = {
            "great", "good", "excellent", "amazing", "wonderful", "fantastic",
            "helpful", "thanks", "thank", "perfect", "love", "best", "happy",
            "satisfied", "impressed", "awesome", "brilliant", "pleased",
        }
        negative_words = {
            "bad", "terrible", "awful", "horrible", "worst", "hate", "angry",
            "frustrated", "disappointed", "useless", "poor", "waste", "upset",
            "annoyed", "unhappy", "dissatisfied",
        }

        lower = text.lower()
        words = set(lower.split())

        pos_score = len(words & positive_words)
        neg_score = len(words & negative_words)

        total = pos_score + neg_score
        if total == 0:
            return "neutral", 0.0

        net_score = (pos_score - neg_score) / total

        if net_score > 0.5:
            return "very_positive", net_score
        if net_score > 0.1:
            return "positive", net_score
        if net_score < -0.5:
            return "very_negative", net_score
        if net_score < -0.1:
            return "negative", net_score
        return "neutral", net_score


# Singleton instance
_conversation_service: ConversationService | None = None


def get_conversation_service() -> ConversationService:
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService()
    return _conversation_service
