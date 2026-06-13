"""
Intent Detection Service — Keyword-based intent analysis for sales conversations.
"""

import re
from typing import Any


INTENT_PATTERNS: dict[str, list[str]] = {
    "wrong_identity": [r"wrong number", r"who are you", r"never visited", r"never came", r"not your customer", r"why are you calling"],
    "angry_complaint": [r"terrible", r"worst", r"frustrated", r"angry", r"very upset", r"bad service", r"waste of time", r"unacceptable"],
    "callback_request": [r"call me later", r"call (again|back)", r"busy now", r"in a meeting", r"not (free|available)", r"later", r"tomorrow"],
    "positive_feedback": [r"great", r"excellent", r"good (service|job|work)", r"thank you", r"satisfied", r"happy", r"amazing", r"appreciate"],
    "confused_customer": [r"(don't|do not) understand", r"can you explain", r"what do you mean", r"confused", r"clarify"],
    "general_inquiry": [r"(what|how) (much|many|does|is|are|can)", r"tell me (about|more)", r"information", r"details", r"pricing", r"cost", r"price"],
    "interested": [r"tell me more", r"sounds good", r"interested", r"sign me up", r"let's do it", r"i want", r"i would like"],
    "not_interested": [r"not interested", r"no thanks", r"don't call", r"stop calling", r"leave me alone", r"not now"],
}


class IntentResult:
    def __init__(self, intent: str, confidence: float = 0.0, method: str = "keyword", details: list[tuple[str, float]] | None = None):
        self.intent = intent
        self.confidence = confidence
        self.method = method
        self.details = details or []


class IntentService:
    """Keyword-based intent detection service."""

    async def detect(self, text: str, method: str = "auto") -> IntentResult:
        text_lower = text.lower()
        scores: list[tuple[str, float]] = []
        for intent, patterns in INTENT_PATTERNS.items():
            score = 0.0
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    score = max(score, 1.0)
                    if len(pattern) > 20:
                        score = max(score, 1.2)
            if score > 0:
                scores.append((intent, score))
        if not scores:
            return IntentResult(intent="general_query", confidence=0.3, method="keyword")
        scores.sort(key=lambda x: x[1], reverse=True)
        best = scores[0]
        confidence = min(best[1] / 1.5, 1.0)
        return IntentResult(intent=best[0], confidence=confidence, method="keyword", details=scores[:3])


_intent_service: IntentService | None = None


def get_intent_service() -> IntentService:
    global _intent_service
    if _intent_service is None:
        _intent_service = IntentService()
    return _intent_service
