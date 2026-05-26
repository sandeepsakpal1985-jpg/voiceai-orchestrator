"""Memory/RAG Provider Abstraction — Abstract Base Classes

Supports pluggable vector databases and embedding models for
semantic search, conversation memory, and knowledge retrieval.
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional


class EmbeddingProvider(ABC):
    """Provider interface for generating text embeddings."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """Generate an embedding vector for a single text string."""
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embedding vectors for multiple texts."""
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Dimension of the embedding vectors."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...


class VectorStoreProvider(ABC):
    """Provider interface for vector databases.

    Supports upserting document chunks and searching by semantic similarity.
    """

    @abstractmethod
    async def create_collection(self, name: str, dimension: int) -> None:
        """Create a named collection with the given embedding dimension."""
        ...

    @abstractmethod
    async def delete_collection(self, name: str) -> None:
        """Delete a collection and all its contents."""
        ...

    @abstractmethod
    async def upsert(
        self,
        collection: str,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict] | None = None,
    ) -> None:
        """Insert or update documents with their embeddings."""
        ...

    @abstractmethod
    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
        filter: dict | None = None,
    ) -> list[dict]:
        """Search for the most similar documents.

        Returns list of dicts with keys: id, document, metadata, score
        """
        ...

    @abstractmethod
    async def delete(self, collection: str, ids: list[str]) -> None:
        """Delete documents by their IDs from a collection."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def supports_filtering(self) -> bool:
        ...
