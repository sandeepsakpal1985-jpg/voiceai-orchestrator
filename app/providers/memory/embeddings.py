"""Sentence Transformer Embedding Provider — Local embeddings using sentence-transformers.

Supports any HuggingFace SentenceTransformer model.
Falls back gracefully if the model is not available.
"""

import logging
from typing import Any

from app.providers.memory.base import EmbeddingProvider

logger = logging.getLogger("voiceai.embeddings")


class SentenceTransformerEmbeddings(EmbeddingProvider):
    """Local embedding provider using Sentence Transformers.

    Supports optional GPU acceleration via the ``device`` parameter.
    Uses GPU auto-detection when ``device="auto"``.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: str = "auto"):
        self._model_name = model_name
        self._device = device
        self._model: Any = None
        self._dimension: int = 384  # all-MiniLM-L6-v2 default

    async def _ensure_model(self) -> Any:
        if self._model is not None:
            return self._model

        # Resolve device
        device = self._device
        if device == "auto":
            try:
                from app.providers.gpu import recommended_device
                device = recommended_device(fallback="cpu")
            except ImportError:
                device = "cpu"

        try:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(
                self._model_name,
                device=device if device != "cpu" else None,
            )
            self._dimension = self._model.get_embedding_dimension()
            logger.info(
                "Loaded embedding model: %s (dim=%d, device=%s)",
                self._model_name,
                self._dimension,
                device,
            )
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. Using fallback embedding."
            )
            self._model = None
        except Exception as e:
            logger.warning(
                "Failed to load embedding model '%s': %s. Using fallback.",
                self._model_name,
                e,
            )
            self._model = None

        return self._model

    async def embed(self, text: str) -> list[float]:
        model = await self._ensure_model()
        if model is None:
            return self._fallback_embed(text)

        import numpy as np

        embedding = model.encode(text, normalize_embeddings=True)
        return embedding.tolist() if isinstance(embedding, np.ndarray) else embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        model = await self._ensure_model()
        if model is None:
            return [self._fallback_embed(t) for t in texts]

        import numpy as np

        embeddings = model.encode(texts, normalize_embeddings=True)
        return [e.tolist() if isinstance(e, np.ndarray) else e for e in embeddings]

    def _fallback_embed(self, text: str) -> list[float]:
        """Simple fallback using normalized character frequency vector."""
        import hashlib

        # Create a deterministic pseudo-embedding
        digest = hashlib.md5(text.encode()).digest()
        vec = [b / 255.0 for b in digest]
        # Pad or truncate to match dimension
        while len(vec) < self._dimension:
            vec.extend(vec[: min(len(vec), self._dimension - len(vec))])
        return vec[: self._dimension]

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def provider_name(self) -> str:
        return f"sentence-transformers/{self._model_name}"
