"""
Conversation Service — Manages conversation state, history, and sentiment analysis.
Uses in-memory storage with automatic TTL-based cleanup.
"""

import asyncio
import logging
import time
import uuid

from app.models.schemas import Message, ConversationCreate, ConversationResponse

logger = logging.getLogger("ai_sales_agent.conversation")

DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly and professional AI sales assistant. "
    "Keep responses concise and conversational, suitable for a voice call. "
    "Speak naturally and ask relevant follow-up questions."
)

COMPLETED_CONVERSATION_TTL: int = 3600
CLEANUP_INTERVAL: int = 300


class ConversationState:
    """In-memory conversation state with metadata."""

    def __init__(self, id: str, contact_phone: str, contact_name: str | None = None, campaign_id: str | None = None, metadata: dict | None = None):
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

    def is_expired(self, ttl: int = COMPLETED_CONVERSATION_TTL) -> bool:
        if self.status in ("completed", "failed") and self.ended_at:
            return (time.time() - self.ended_at) > ttl
        return False

    def to_response(self) -> ConversationResponse:
        return ConversationResponse(
            id=self.id, contact_name=self.contact_name, contact_phone=self.contact_phone,
            status=self.status, messages=self.messages, sentiment=self.sentiment_label,
            sentiment_score=self.sentiment_score, duration_seconds=self.duration_seconds,
            started_at=self.started_at, ended_at=self.ended_at,
        )


class ConversationService:
    """Manages all active conversations with automatic TTL-based eviction."""

    def __init__(self, cleanup_interval: int = CLEANUP_INTERVAL):
        self._conversations: dict[str, ConversationState] = {}
        self._cleanup_interval = cleanup_interval
        self._cleanup_task: asyncio.Task | None = None

    async def start_cleanup_task(self) -> None:
        if self._cleanup_task is not None:
            return

        async def _cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(self._cleanup_interval)
                    evicted = self._evict_expired()
                    if evicted:
                        logger.info("Evicted %d expired conversations", evicted)
                except asyncio.CancelledError:
                    break
                except Exception:
                    logger.exception("Error in cleanup loop")

        self._cleanup_task = asyncio.create_task(_cleanup_loop())

    async def stop_cleanup_task(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None

    def _evict_expired(self) -> int:
        expired_ids = [cid for cid, conv in self._conversations.items() if conv.is_expired()]
        for cid in expired_ids:
            del self._conversations[cid]
        return len(expired_ids)

    def create(self, params: ConversationCreate) -> ConversationState:
        conv_id = str(uuid.uuid4())
        state = ConversationState(id=conv_id, contact_phone=params.contact_phone, contact_name=params.contact_name, campaign_id=params.campaign_id, metadata=params.metadata)
        state.status = "in_progress"
        self._conversations[conv_id] = state
        return state

    def get(self, conversation_id: str) -> ConversationState | None:
        return self._conversations.get(conversation_id)

    def add_message(self, conversation_id: str, message: Message) -> Message:
        conv = self.get(conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")
        msg = Message(role=message.role, content=message.content, timestamp=message.timestamp or time.time())
        conv.messages.append(msg)
        return msg

    def update_status(self, conversation_id: str, status: str) -> None:
        conv = self.get(conversation_id)
        if not conv:
            return
        conv.status = status
        if status in ("completed", "failed"):
            conv.ended_at = time.time()

    def update_sentiment(self, conversation_id: str, label: str, score: float) -> None:
        conv = self.get(conversation_id)
        if not conv:
            return
        conv.sentiment_label = label
        conv.sentiment_score = score

    def get_all(self, active_only: bool = False) -> list[ConversationState]:
        convs = list(self._conversations.values())
        if active_only:
            convs = [c for c in convs if c.status in ("initializing", "in_progress")]
        return convs

    def get_history(self, conversation_id: str, limit: int = 10) -> list[Message]:
        conv = self.get(conversation_id)
        if not conv:
            return []
        return conv.messages[-limit:]

    def generate_summary(self, conversation_id: str) -> str:
        conv = self.get(conversation_id)
        if not conv or not conv.messages:
            return "No conversation recorded."
        return (f"Conversation with {conv.contact_name or conv.contact_phone}. "
                f"{len(conv.messages)} messages exchanged. "
                f"Duration: {conv.duration_seconds:.0f}s. "
                f"Final sentiment: {conv.sentiment_label} ({conv.sentiment_score:.2f}).")

    def delete(self, conversation_id: str) -> bool:
        return self._conversations.pop(conversation_id, None) is not None

    async def process_llm_turn(self, conversation_id: str, user_input: str, system_prompt: str | None = None, store_conversation: bool = True, include_history: bool = True, history_limit: int = 4) -> dict:
        conv = self.get(conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")
        from app.voice import get_voice_pipeline
        pipeline = get_voice_pipeline()

        messages = [{"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}]
        if include_history:
            history = self.get_history(conversation_id, limit=history_limit)
            for msg in history:
                messages.append({"role": "assistant" if msg.role == "agent" else msg.role, "content": msg.content})
        messages.append({"role": "user", "content": user_input})

        response = await pipeline.llm.complete(messages)

        if store_conversation:
            self.add_message(conversation_id, Message(role="user", content=user_input, timestamp=time.time()))
            self.add_message(conversation_id, Message(role="agent", content=response, timestamp=time.time()))
            label, score = self.analyze_sentiment(user_input)
            self.update_sentiment(conversation_id, label, score)

        return {"conversation_id": conversation_id, "response": response}

    @staticmethod
    def analyze_sentiment(text: str) -> tuple[str, float]:
        positive_words = {"great", "good", "excellent", "amazing", "wonderful", "fantastic", "helpful", "thanks", "thank", "perfect", "love", "best", "happy", "satisfied", "impressed", "awesome", "pleased"}
        negative_words = {"bad", "terrible", "awful", "horrible", "worst", "hate", "angry", "frustrated", "disappointed", "useless", "poor", "waste", "upset", "annoyed", "unhappy", "dissatisfied"}
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


_conversation_service: ConversationService | None = None


def get_conversation_service() -> ConversationService:
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService()
    return _conversation_service
