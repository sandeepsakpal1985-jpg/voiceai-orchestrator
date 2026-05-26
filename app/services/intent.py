"""
Intent Detection Service — Multi-strategy intent analysis.

Supports:
- Keyword-based fast matching (legacy intent_router.py style)
- Semantic matching via Sentence Transformers (legacy semantic_intent_engine.py style)
- Configurable confidence thresholds
"""

import re
from typing import Any

# ── Keyword Patterns ────────────────────────────────────────────────

INTENT_PATTERNS: dict[str, list[str]] = {
    "wrong_identity": [
        r"wrong number",
        r"who are you",
        r"never visited",
        r"never came",
        r"not your customer",
        r"why are you calling",
        r"don't know (you|your)",
        r"never used",
        r"where did you get",
    ],
    "angry_complaint": [
        r"terrible",
        r"worst",
        r"frustrated",
        r"angry",
        r"very upset",
        r"bad service",
        r"waste of time",
        r"pathetic",
        r"unacceptable",
        r"useless",
        r"complain",
    ],
    "callback_request": [
        r"call me later",
        r"call (again|back)",
        r"busy now",
        r"in a meeting",
        r"not (free|available)",
        r"later",
        r"some other time",
        r"tomorrow",
    ],
    "positive_feedback": [
        r"great",
        r"excellent",
        r"good (service|job|work)",
        r"thank you",
        r"satisfied",
        r"happy",
        r"amazing",
        r"wonderful",
        r"appreciate",
    ],
    "confused_customer": [
        r"(don't|do not) understand",
        r"can you explain",
        r"what do you mean",
        r"confused",
        r"clarify",
        r"what are you talking",
    ],
    "audio_issue": [
        r"(can't|cannot) hear",
        r"voice (breaking|cutting)",
        r"audio (problem|issue)",
        r"low volume",
        r"speak louder",
        r"connection (issue|problem)",
    ],
    "flirting_customer": [
        r"your voice (is |sounds )?(sweet|beautiful|nice|sexy|hot)",
        r"are you (married|single)",
        r"i (like|love) your voice",
        r"keep talking",
    ],
    "threatening_customer": [
        r"(will|shall) complain",
        r"(will|shall) call (police|lawyer)",
        r"legal action",
        r"sue",
        r"know people",
        r"destroy (your|the)",
        r"don't mess with",
    ],
    "service_complaint": [
        r"(food|room|service|product) was (cold|dirty|bad|slow|terrible)",
        r"(ac|heater|tv|wifi) not working",
        r"broken",
        r"not working",
    ],
    "general_inquiry": [
        r"(what|how) (much|many|does|is|are|can)",
        r"tell me (about|more)",
        r"information",
        r"details",
        r"pricing",
        r"cost",
        r"price",
    ],
}


class IntentResult:
    """Result of intent detection."""

    def __init__(
        self,
        intent: str,
        confidence: float = 0.0,
        method: str = "keyword",
        details: list[tuple[str, float]] | None = None,
    ):
        self.intent = intent
        self.confidence = confidence
        self.method = method
        self.details = details or []

    def __repr__(self) -> str:
        return f"IntentResult(intent={self.intent!r}, confidence={self.confidence:.3f}, method={self.method!r})"


class IntentService:
    """Multi-strategy intent detection service."""

    def __init__(self):
        self._semantic_model = None
        self._semantic_loaded = False
        self._intent_embeddings: dict[str, Any] = {}

    async def detect_keyword(self, text: str) -> IntentResult:
        """Fast keyword-based intent detection."""
        text_lower = text.lower()
        scores: list[tuple[str, float]] = []

        for intent, patterns in INTENT_PATTERNS.items():
            score = 0.0
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    score = max(score, 1.0)
                    # Weight by pattern specificity
                    if len(pattern) > 20:
                        score = max(score, 1.2)

            if score > 0:
                scores.append((intent, score))

        if not scores:
            return IntentResult(intent="general_query", confidence=0.3, method="keyword")

        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        best = scores[0]

        # Normalize confidence
        confidence = min(best[1] / 1.5, 1.0)

        return IntentResult(
            intent=best[0],
            confidence=confidence,
            method="keyword",
            details=scores[:3],
        )

    async def load_semantic_model(self) -> None:
        """Lazy-load the Sentence Transformer model for semantic detection."""
        if self._semantic_loaded:
            return

        try:
            from sentence_transformers import SentenceTransformer

            self._semantic_model = SentenceTransformer("all-MiniLM-L6-v2")
            self._semantic_loaded = True
        except ImportError:
            self._semantic_loaded = False

    async def detect_semantic(self, text: str) -> IntentResult:
        """Semantic intent detection using Sentence Transformers."""
        await self.load_semantic_model()

        if not self._semantic_loaded or self._semantic_model is None:
            return await self.detect_keyword(text)

        import torch
        from sentence_transformers import util

        # Build embeddings lazily
        if not self._intent_embeddings:
            for intent, patterns in INTENT_PATTERNS.items():
                embeddings = self._semantic_model.encode(
                    patterns, convert_to_tensor=True
                )
                self._intent_embeddings[intent] = embeddings

        # Encode user input
        user_embedding = self._semantic_model.encode(
            text, convert_to_tensor=True
        )

        scores: list[tuple[str, float]] = []
        for intent, embeddings in self._intent_embeddings.items():
            cosine_scores = util.cos_sim(user_embedding, embeddings)
            best_score = float(torch.max(cosine_scores).item())
            scores.append((intent, best_score))

        # Sort by score descending
        scores.sort(key=lambda x: x[1], reverse=True)

        if not scores:
            return IntentResult(intent="general_query", confidence=0.0, method="semantic")

        best_intent = scores[0][0]
        best_score = scores[0][1]
        second_score = scores[1][1] if len(scores) > 1 else 0.0

        # Confidence rules
        if best_score < 0.45:
            return IntentResult(
                intent="unknown_intent",
                confidence=best_score,
                method="semantic",
                details=scores[:3],
            )

        if abs(best_score - second_score) < 0.05:
            return IntentResult(
                intent="ambiguous_intent",
                confidence=best_score,
                method="semantic",
                details=scores[:3],
            )

        return IntentResult(
            intent=best_intent,
            confidence=best_score,
            method="semantic",
            details=scores[:3],
        )

    async def detect(
        self, text: str, method: str = "auto"
    ) -> IntentResult:
        """Detect intent using the best available method.

        Args:
            text: User input text
            method: 'keyword', 'semantic', or 'auto' (tries semantic, falls back to keyword)

        Returns:
            IntentResult with detected intent and confidence
        """
        if method == "semantic":
            return await self.detect_semantic(text)
        elif method == "keyword":
            return await self.detect_keyword(text)
        else:
            # Auto: try semantic, fallback to keyword
            result = await self.detect_semantic(text)
            if result.intent in ("unknown_intent",) and result.confidence < 0.3:
                result = await self.detect_keyword(text)
            return result

    def get_intents_list(self) -> list[str]:
        """Get list of all supported intents."""
        return list(INTENT_PATTERNS.keys()) + ["general_query", "unknown_intent", "ambiguous_intent"]


# Singleton instance
_intent_service: IntentService | None = None


def get_intent_service() -> IntentService:
    global _intent_service
    if _intent_service is None:
        _intent_service = IntentService()
    return _intent_service
