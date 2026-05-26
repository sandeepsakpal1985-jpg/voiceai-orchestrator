"""ChromaDB Vector Store Provider — Local vector database using ChromaDB.

Supports full CRUD on collections, semantic search with metadata filtering,
and is compatible with Sentence Transformers or any EmbeddingProvider.
"""

import logging
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.providers.memory.base import VectorStoreProvider

logger = logging.getLogger("voiceai.chromadb")


class ChromaDBProvider(VectorStoreProvider):
    """Vector store provider backed by ChromaDB (local or remote)."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8000,
        use_local: bool = True,
        persist_directory: str = "./chroma_data",
    ):
        self._host = host
        self._port = port
        self._use_local = use_local
        self._persist_directory = persist_directory
        self._client: chromadb.ClientAPI | None = None
        self._collections: dict[str, Any] = {}

    async def _ensure_client(self) -> chromadb.ClientAPI:
        if self._client is not None:
            return self._client

        if self._use_local:
            self._client = chromadb.PersistentClient(
                path=self._persist_directory,
                settings=ChromaSettings(
                    anonymized_telemetry=False,
                    allow_reset=True,
                ),
            )
            logger.info(
                "ChromaDB local client initialized at %s",
                self._persist_directory,
            )
        else:
            self._client = chromadb.HttpClient(
                host=self._host,
                port=self._port,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
            logger.info(
                "ChromaDB HTTP client initialized at %s:%s",
                self._host,
                self._port,
            )

        return self._client

    async def create_collection(self, name: str, dimension: int) -> None:
        client = await self._ensure_client()
        try:
            collection = client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": "cosine", "dimension": dimension},
            )
            self._collections[name] = collection
            logger.info("Created/retrieved collection: %s (dim=%d)", name, dimension)
        except Exception as e:
            logger.error("Failed to create collection '%s': %s", name, e)
            raise

    async def delete_collection(self, name: str) -> None:
        client = await self._ensure_client()
        try:
            client.delete_collection(name)
            self._collections.pop(name, None)
            logger.info("Deleted collection: %s", name)
        except Exception as e:
            logger.error("Failed to delete collection '%s': %s", name, e)
            raise

    async def upsert(
        self,
        collection: str,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict] | None = None,
    ) -> None:
        client = await self._ensure_client()
        col = client.get_or_create_collection(collection)
        col.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas or [{}] * len(ids),
        )
        logger.debug("Upserted %d documents to '%s'", len(ids), collection)

    async def search(
        self,
        collection: str,
        query_embedding: list[float],
        top_k: int = 5,
        filter: dict | None = None,
    ) -> list[dict]:
        client = await self._ensure_client()
        col = client.get_or_create_collection(collection)
        results = col.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=filter,
        )

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
        logger.debug("Deleted %d documents from '%s'", len(ids), collection)

    @property
    def provider_name(self) -> str:
        return "chromadb"

    @property
    def supports_filtering(self) -> bool:
        return True
