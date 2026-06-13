"""ChromaDB Vector Store Provider — Local vector database using ChromaDB."""

import logging

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.providers.memory.base import VectorStoreProvider

logger = logging.getLogger("ai_sales_agent.chromadb")


class ChromaDBProvider(VectorStoreProvider):
    """Vector store provider backed by ChromaDB (local)."""

    def __init__(self, persist_directory: str = "./chroma_data"):
        self._persist_directory = persist_directory
        self._client: chromadb.ClientAPI | None = None

    async def _ensure_client(self) -> chromadb.ClientAPI:
        if self._client is None:
            self._client = chromadb.PersistentClient(path=self._persist_directory, settings=ChromaSettings(anonymized_telemetry=False))
            logger.info("ChromaDB initialized at %s", self._persist_directory)
        return self._client

    async def create_collection(self, name: str, dimension: int) -> None:
        client = await self._ensure_client()
        client.get_or_create_collection(name=name, metadata={"hnsw:space": "cosine", "dimension": dimension})
        logger.info("Created/retrieved collection: %s (dim=%d)", name, dimension)

    async def delete_collection(self, name: str) -> None:
        client = await self._ensure_client()
        client.delete_collection(name)

    async def upsert(self, collection: str, ids: list[str], embeddings: list[list[float]], documents: list[str], metadatas: list[dict] | None = None) -> None:
        client = await self._ensure_client()
        col = client.get_or_create_collection(collection)
        col.upsert(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas or [{}] * len(ids))

    async def search(self, collection: str, query_embedding: list[float], top_k: int = 5, filter: dict | None = None) -> list[dict]:
        client = await self._ensure_client()
        col = client.get_or_create_collection(collection)
        results = col.query(query_embeddings=[query_embedding], n_results=top_k, where=filter)
        if not results["ids"]:
            return []
        items = []
        for i in range(len(results["ids"][0])):
            items.append({
                "id": results["ids"][0][i],
                "document": results["documents"][0][i] if results["documents"] else "",
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "score": results["distances"][0][i] if results["distances"] else 0.0,
            })
        return items

    async def delete(self, collection: str, ids: list[str]) -> None:
        client = await self._ensure_client()
        col = client.get_or_create_collection(collection)
        col.delete(ids=ids)

    @property
    def provider_name(self) -> str:
        return "chromadb"

    @property
    def supports_filtering(self) -> bool:
        return True
