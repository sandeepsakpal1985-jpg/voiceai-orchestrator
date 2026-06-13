"""Memory/RAG Provider Abstraction — Abstract Base Classes."""

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """Provider interface for generating text embeddings."""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        ...

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...


class VectorStoreProvider(ABC):
    """Provider interface for vector databases."""

    @abstractmethod
    async def create_collection(self, name: str, dimension: int) -> None:
        ...

    @abstractmethod
    async def delete_collection(self, name: str) -> None:
        ...

    @abstractmethod
    async def upsert(self, collection: str, ids: list[str], embeddings: list[list[float]], documents: list[str], metadatas: list[dict] | None = None) -> None:
        ...

    @abstractmethod
    async def search(self, collection: str, query_embedding: list[float], top_k: int = 5, filter: dict | None = None) -> list[dict]:
        ...

    @abstractmethod
    async def delete(self, collection: str, ids: list[str]) -> None:
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def supports_filtering(self) -> bool:
        ...
