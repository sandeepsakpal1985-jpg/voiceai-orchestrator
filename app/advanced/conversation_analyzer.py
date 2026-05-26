"""
Conversation Analyzer — Multi-dimension semantic analysis of conversation text.

Integrates concepts from:
- conversation_analyzer.py: Semantic analysis with Sentence Transformers
- semantic_intent_engine.py: Semantic intent matching
- live_state_engine.py: Real-time emotion state tracking from text
"""

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger("voiceai.advanced.conversation_analyzer")


# ── Semantic Dimensions (from conversation_analyzer.py) ────────────

# During initialization, these are encoded into embeddings for similarity search.
# The embeddings are computed lazily to avoid blocking startup.

SEMANTIC_DIMENSIONS: dict[str, list[str]] = {
    "anger": [
        "terrible service",
        "worst experience",
        "i am angry",
        "pathetic support",
        "very frustrated",
        "this is unacceptable",
        "waste of my time",
    ],
    "confusion": [
        "i dont understand",
        "please explain",
        "what do you mean",
        "i am confused",
        "clarify this for me",
        "what are you talking about",
    ],
    "positive": [
        "great service",
        "thank you",
        "excellent support",
        "very happy",
        "amazing work",
        "wonderful experience",
    ],
    "threat": [
        "i will complain",
        "i will call police",
        "legal action",
        "do not mess with me",
        "you will regret this",
        "i know people",
    ],
    "flirting": [
        "your voice is sweet",
        "are you married",
        "i love your voice",
        "you sound nice",
        "keep talking please",
    ],
    "wrong_identity": [
        "wrong number",
        "never visited",
        "who are you",
        "dont know you",
        "why are you calling me",
        "not your customer",
    ],
    "callback": [
        "call later",
        "busy now",
        "in meeting",
        "call tomorrow",
        "not free right now",
        "some other time",
    ],
    "audio_problem": [
        "cant hear you",
        "voice breaking",
        "audio issue",
        "you are cutting out",
        "speak louder please",
        "connection is bad",
    ],
    "resistance": [
        "this wont help",
        "waste of time",
        "no point talking",
        "nothing will change",
        "dont waste my time",
        "not interested",
    ],
    "urgency": [
        "as soon as possible",
        "urgent",
        "emergency",
        "right now",
        "immediately",
        "cant wait",
    ],
    "gratitude": [
        "i appreciate",
        "thank you so much",
        "very helpful",
        "grateful",
        "thanks a lot",
        "you have been great",
    ],
    "sarcasm": [
        "oh great",
        "thanks a lot for nothing",
        "wonderful service",
        "just perfect",
        "exactly what i needed",
        "brilliant",
    ],
}


class ConversationAnalyzer:
    """Multi-dimension semantic analysis of conversation text.

    Uses Sentence Transformers to compute cosine similarity between
    user input and predefined semantic dimensions. Returns ranked scores.

    The model is loaded lazily on first use to avoid blocking startup.
    """

    def __init__(self):
        self._model = None
        self._model_loaded = False
        self._dimension_embeddings: dict[str, Any] = {}
        self._load_attempted = False

    async def _load_model(self) -> bool:
        """Lazy-load the Sentence Transformer model.

        Returns True if the model loaded successfully.
        """
        if self._model_loaded or self._load_attempted:
            return self._model_loaded

        self._load_attempted = True

        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading Sentence Transformer model (all-MiniLM-L6-v2)...")
            self._model = SentenceTransformer("all-MiniLM-L6-v2")

            # Build dimension embeddings
            import torch

            for dim, examples in SEMANTIC_DIMENSIONS.items():
                embeddings = self._model.encode(examples, convert_to_tensor=True)
                self._dimension_embeddings[dim] = embeddings

            self._model_loaded = True
            logger.info(
                f"Conversation analyzer ready - {len(self._dimension_embeddings)} dimensions loaded"
            )
            return True

        except ImportError:
            logger.warning(
                "sentence-transformers not installed. "
                "Semantic analysis disabled (fallback to keyword analysis). "
                "Install with: pip install sentence-transformers torch"
            )
            return False
        except Exception as e:
            logger.warning(f"Failed to load model: {e}")
            return False

    async def analyze(
        self, text: str, top_k: int = 5
    ) -> list[dict]:
        """Analyze text against all semantic dimensions.

        Args:
            text: The text to analyze
            top_k: Number of top results to return

        Returns:
            List of dicts with 'dimension', 'score', and 'label' keys,
            sorted by score descending. Empty if model not available.
        """
        if not text.strip():
            return []

        # Try to load model
        if not self._model_loaded:
            await self._load_model()

        if not self._model_loaded:
            # Fall back to keyword matching
            return self._keyword_analyze(text, top_k)

        import torch
        from sentence_transformers import util

        try:
            user_embedding = self._model.encode(text, convert_to_tensor=True)

            scores: list[dict] = []
            for dim, embeddings in self._dimension_embeddings.items():
                cosine_scores = util.cos_sim(user_embedding, embeddings)
                best_score = float(torch.max(cosine_scores).item())
                scores.append({
                    "dimension": dim,
                    "score": round(best_score, 3),
                    "label": dim.replace("_", " ").title(),
                })

            # Sort by score descending
            scores.sort(key=lambda x: x["score"], reverse=True)
            return scores[:top_k]

        except Exception as e:
            logger.warning(f"Semantic analysis error: {e}")
            return self._keyword_analyze(text, top_k)

    def _keyword_analyze(self, text: str, top_k: int = 5) -> list[dict]:
        """Fallback keyword-based analysis when sentence-transformers is unavailable."""
        lower = text.lower()
        scores: list[dict] = []

        for dim, examples in SEMANTIC_DIMENSIONS.items():
            score = sum(1 for ex in examples if ex in lower)
            normalized = min(score / max(len(examples) * 0.3, 1), 1.0)
            if normalized > 0:
                scores.append({
                    "dimension": dim,
                    "score": round(normalized, 3),
                    "label": dim.replace("_", " ").title(),
                })

        scores.sort(key=lambda x: x["score"], reverse=True)
        return scores[:top_k]

    async def get_dominant_emotion(self, text: str) -> str:
        """Get the dominant emotion from the text analysis.

        Returns the dimension name with the highest score, or 'neutral' if none found.
        """
        results = await self.analyze(text, top_k=1)
        if results and results[0]["score"] > 0.3:
            return results[0]["dimension"]
        return "neutral"

    @property
    def is_ready(self) -> bool:
        """Check if the model is loaded and ready."""
        return self._model_loaded

    def dimensions(self) -> list[str]:
        """Get list of all supported analysis dimensions."""
        return list(SEMANTIC_DIMENSIONS.keys())


# ── Singleton ───────────────────────────────────────────────────────

_analyzer: ConversationAnalyzer | None = None


def get_conversation_analyzer() -> ConversationAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = ConversationAnalyzer()
    return _analyzer
