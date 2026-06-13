"""
Conversation Analyzer — Multi-dimension semantic analysis of conversation text.

Integrates concepts from:
- Semantic analysis with Sentence Transformers
- Semantic intent matching
- Real-time emotion state tracking from text

Falls back to keyword analysis when sentence-transformers is not available.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger("ai_sales_agent.advanced.conversation_analyzer")


# ── Semantic Dimensions ─────────────────────────────────────────────

SEMANTIC_DIMENSIONS: dict[str, list[str]] = {
    "anger": ["terrible service", "worst experience", "i am angry", "pathetic support", "very frustrated", "this is unacceptable", "waste of my time"],
    "confusion": ["i dont understand", "please explain", "what do you mean", "i am confused", "clarify this for me", "what are you talking about"],
    "positive": ["great service", "thank you", "excellent support", "very happy", "amazing work", "wonderful experience"],
    "threat": ["i will complain", "i will call police", "legal action", "do not mess with me", "you will regret this", "i know people"],
    "flirting": ["your voice is sweet", "are you married", "i love your voice", "you sound nice", "keep talking please"],
    "wrong_identity": ["wrong number", "never visited", "who are you", "dont know you", "why are you calling me", "not your customer"],
    "callback": ["call later", "busy now", "in meeting", "call tomorrow", "not free right now", "some other time"],
    "audio_problem": ["cant hear you", "voice breaking", "audio issue", "you are cutting out", "speak louder please", "connection is bad"],
    "resistance": ["this wont help", "waste of time", "no point talking", "nothing will change", "dont waste my time", "not interested"],
    "urgency": ["as soon as possible", "urgent", "emergency", "right now", "immediately", "cant wait"],
    "gratitude": ["i appreciate", "thank you so much", "very helpful", "grateful", "thanks a lot", "you have been great"],
    "sarcasm": ["oh great", "thanks a lot for nothing", "wonderful service", "just perfect", "exactly what i needed", "brilliant"],
}


class ConversationAnalyzer:
    """Multi-dimension semantic analysis of conversation text.

    Uses Sentence Transformers to compute cosine similarity between
    user input and predefined semantic dimensions. Falls back to keyword
    analysis when the model is unavailable.
    """

    def __init__(self):
        self._model = None
        self._model_loaded = False
        self._dimension_embeddings: dict[str, Any] = {}
        self._load_attempted = False

    async def _load_model(self) -> bool:
        if self._model_loaded or self._load_attempted:
            return self._model_loaded
        self._load_attempted = True
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading Sentence Transformer model (all-MiniLM-L6-v2)...")
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            import torch
            for dim, examples in SEMANTIC_DIMENSIONS.items():
                embeddings = self._model.encode(examples, convert_to_tensor=True)
                self._dimension_embeddings[dim] = embeddings
            self._model_loaded = True
            logger.info("Conversation analyzer ready — %d dimensions loaded", len(self._dimension_embeddings))
            return True
        except ImportError:
            logger.warning("sentence-transformers not installed. Using keyword fallback. pip install sentence-transformers torch")
            return False
        except Exception as e:
            logger.warning("Failed to load model: %s", e)
            return False

    async def analyze(self, text: str, top_k: int = 5) -> list[dict]:
        if not text.strip():
            return []
        if not self._model_loaded:
            await self._load_model()
        if not self._model_loaded:
            return self._keyword_analyze(text, top_k)
        import torch
        from sentence_transformers import util
        try:
            user_embedding = self._model.encode(text, convert_to_tensor=True)
            scores: list[dict] = []
            for dim, embeddings in self._dimension_embeddings.items():
                cosine_scores = util.cos_sim(user_embedding, embeddings)
                best_score = float(torch.max(cosine_scores).item())
                scores.append({"dimension": dim, "score": round(best_score, 3), "label": dim.replace("_", " ").title()})
            scores.sort(key=lambda x: x["score"], reverse=True)
            return scores[:top_k]
        except Exception as e:
            logger.warning("Semantic analysis error: %s", e)
            return self._keyword_analyze(text, top_k)

    def _keyword_analyze(self, text: str, top_k: int = 5) -> list[dict]:
        lower = text.lower()
        scores: list[dict] = []
        for dim, examples in SEMANTIC_DIMENSIONS.items():
            score = sum(1 for ex in examples if ex in lower)
            normalized = min(score / max(len(examples) * 0.3, 1), 1.0)
            if normalized > 0:
                scores.append({"dimension": dim, "score": round(normalized, 3), "label": dim.replace("_", " ").title()})
        scores.sort(key=lambda x: x["score"], reverse=True)
        return scores[:top_k]

    async def get_dominant_emotion(self, text: str) -> str:
        results = await self.analyze(text, top_k=1)
        if results and results[0]["score"] > 0.3:
            return results[0]["dimension"]
        return "neutral"

    @property
    def is_ready(self) -> bool:
        return self._model_loaded

    def dimensions(self) -> list[str]:
        return list(SEMANTIC_DIMENSIONS.keys())


# ── Singleton ───────────────────────────────────────────────────────

_analyzer: ConversationAnalyzer | None = None


def get_conversation_analyzer() -> ConversationAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = ConversationAnalyzer()
    return _analyzer
