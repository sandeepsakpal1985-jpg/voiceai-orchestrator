"""RAG Service — Retrieval-Augmented Generation for knowledge base search."""

import hashlib
import json
import logging
import re

from app.config import settings

logger = logging.getLogger("ai_sales_agent.rag")

DEFAULT_COLLECTION = "knowledge_base"


class RAGService:
    """Retrieval-Augmented Generation service for semantic search."""

    def __init__(self, vector_store=None, embeddings=None, collection_name: str = DEFAULT_COLLECTION):
        self._vector_store = vector_store
        self._embeddings = embeddings
        self._collection_name = collection_name
        self._initialized = False

    async def initialize(self) -> None:
        if self._initialized:
            return
        if self._vector_store and self._embeddings:
            try:
                await self._vector_store.create_collection(self._collection_name, self._embeddings.dimension)
                self._initialized = True
                logger.info("RAG initialized (collection: %s, dim: %d)", self._collection_name, self._embeddings.dimension)
            except Exception as e:
                logger.warning("Failed to initialize RAG: %s", e)

    async def is_available(self) -> bool:
        return self._initialized and self._vector_store is not None and self._embeddings is not None

    async def index_document(self, document_id: str, content: str, metadata: dict | None = None, chunk_size: int = 500, chunk_overlap: int = 50) -> int:
        if not await self.is_available():
            return 0
        chunks = self._chunk_text(content, chunk_size, chunk_overlap)
        if not chunks:
            return 0
        ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [{**(metadata or {}), "document_id": document_id, "chunk_index": i, "chunk_count": len(chunks)} for i in range(len(chunks))]
        embeddings = await self._embeddings.embed_batch(chunks)
        await self._vector_store.upsert(collection=self._collection_name, ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)
        logger.info("Indexed %d chunks for '%s'", len(chunks), document_id)
        return len(chunks)

    async def search(self, query: str, top_k: int = 5, filter: dict | None = None, min_score: float = 0.0) -> list[dict]:
        if not await self.is_available():
            return []
        query_embedding = await self._embeddings.embed(query)
        results = await self._vector_store.search(collection=self._collection_name, query_embedding=query_embedding, top_k=top_k, filter=filter)
        if min_score > 0:
            results = [r for r in results if r.get("score", 0) <= min_score]
        return results

    async def delete_document(self, document_id: str) -> None:
        if not await self.is_available():
            return
        results = await self._vector_store.search(collection=self._collection_name, query_embedding=[0.0] * self._embeddings.dimension, top_k=1000, filter={"document_id": document_id})
        chunk_ids = [r["id"] for r in results if r["metadata"].get("document_id") == document_id]
        if chunk_ids:
            await self._vector_store.delete(self._collection_name, chunk_ids)

    async def build_knowledge_context(self, query: str, top_k: int = 3, max_chars: int = 2000) -> str:
        results = await self.search(query, top_k=top_k)
        if not results:
            return ""
        context_parts, total_chars = [], 0
        for r in results:
            doc = r.get("document", "").strip()
            if not doc:
                continue
            if total_chars + len(doc) > max_chars:
                doc = doc[:max_chars - total_chars] + "..."
            context_parts.append(doc)
            total_chars += len(doc)
            if total_chars >= max_chars:
                break
        return "\n\n---\n\n".join(context_parts)

    def _chunk_text(self, text: str, chunk_size: int, overlap: int) -> list[str]:
        if not text:
            return []
        sentences = re.split(r"(?<=[.!?])\s+", text)
        chunks, current = [], []
        current_len = 0
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if current_len + len(sentence) > chunk_size and current:
                chunks.append(" ".join(current))
                current = []
                current_len = 0
            current.append(sentence)
            current_len += len(sentence)
        if current:
            chunks.append(" ".join(current))
        return chunks if chunks else [text]


_rag_service: "RAGService | None" = None


def get_rag_service() -> "RAGService":
    global _rag_service
    if _rag_service is None:
        from app.providers.memory import ChromaDBProvider, SentenceTransformerEmbeddings
        vector_store = ChromaDBProvider(persist_directory=settings.REDIS_URL or "./chroma_data")
        embeddings = SentenceTransformerEmbeddings(model_name=settings.EMBEDDING_MODEL, device=settings.EMBEDDING_DEVICE)
        _rag_service = RAGService(vector_store=vector_store, embeddings=embeddings)
    return _rag_service
