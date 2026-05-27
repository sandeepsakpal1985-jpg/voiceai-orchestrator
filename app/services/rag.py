"""RAG Service — Retrieval-Augmented Generation for knowledge base search.

Orchestrates embedding generation and vector store operations
to enable semantic search across knowledge documents and conversation history.
"""

import hashlib
import json
import logging
import uuid
from typing import Optional

from app.config import settings
from app.providers.memory.base import VectorStoreProvider, EmbeddingProvider

logger = logging.getLogger("voiceai.rag")

DEFAULT_COLLECTION = "knowledge_base"


class RAGService:
    """Retrieval-Augmented Generation service.

    Provides methods for indexing documents and searching
    across them using semantic similarity with Redis-backed cache.
    """

    def __init__(
        self,
        vector_store: VectorStoreProvider | None = None,
        embeddings: EmbeddingProvider | None = None,
        collection_name: str = DEFAULT_COLLECTION,
        use_semantic_cache: bool = True,
    ):
        self._vector_store = vector_store
        self._embeddings = embeddings
        self._collection_name = collection_name
        self._initialized = False
        self._semantic_cache = None
        self._use_semantic_cache = use_semantic_cache

    async def _get_semantic_cache(self):
        """Lazy-init the Redis-backed semantic cache."""
        if self._semantic_cache is None and self._use_semantic_cache:
            try:
                from app.services.persistence import SemanticCache
                self._semantic_cache = SemanticCache()
            except Exception:
                pass
        return self._semantic_cache

    async def initialize(self) -> None:
        """Initialize the vector store collection."""
        if self._initialized:
            return

        if self._vector_store and self._embeddings:
            try:
                await self._vector_store.create_collection(
                    self._collection_name,
                    self._embeddings.dimension,
                )
                self._initialized = True
                logger.info(
                    "RAG service initialized (collection: %s, dim: %d)",
                    self._collection_name,
                    self._embeddings.dimension,
                )
            except Exception as e:
                logger.warning("Failed to initialize RAG collection: %s", e)
        else:
            logger.warning(
                "RAG service not fully configured (vector_store=%s, embeddings=%s)",
                bool(self._vector_store),
                bool(self._embeddings),
            )

    async def is_available(self) -> bool:
        """Check if RAG service is available for queries."""
        return self._initialized and self._vector_store is not None and self._embeddings is not None

    async def index_document(
        self,
        document_id: str,
        content: str,
        metadata: dict | None = None,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ) -> int:
        """Index a document by splitting into chunks and embedding.

        Args:
            document_id: Unique identifier for the document
            content: Full text content to index
            metadata: Optional metadata to attach to chunks
            chunk_size: Characters per chunk
            chunk_overlap: Overlap between chunks

        Returns:
            Number of chunks indexed
        """
        if not await self.is_available():
            logger.warning("RAG not available, skipping index")
            return 0

        chunks = self._chunk_text(content, chunk_size, chunk_overlap)
        if not chunks:
            return 0

        ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                **(metadata or {}),
                "document_id": document_id,
                "chunk_index": i,
                "chunk_count": len(chunks),
            }
            for i in range(len(chunks))
        ]

        embeddings = await self._embeddings.embed_batch(chunks)

        await self._vector_store.upsert(
            collection=self._collection_name,
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        logger.info("Indexed %d chunks for document '%s'", len(chunks), document_id)
        return len(chunks)

    # ── Semantic Cache (Redis-backed) ──

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filter: dict | None = None,
        min_score: float = 0.0,
        use_cache: bool = True,
    ) -> list[dict]:
        """Search the knowledge base for semantically relevant content.

        Uses Redis-backed semantic cache to accelerate repeated queries.

        Args:
            query: Natural language query
            top_k: Maximum number of results
            filter: Optional metadata filter
            min_score: Minimum similarity score threshold
            use_cache: Whether to check/save the Redis semantic cache

        Returns:
            List of result dicts with document, metadata, score
        """
        if not await self.is_available():
            logger.warning("RAG not available, returning empty results")
            return []

        # Check semantic cache first
        if use_cache:
            try:
                cache = await self._get_semantic_cache()
                if cache:
                    cache_key = hashlib.sha256(
                        f"{query}:{top_k}:{min_score}".encode()
                    ).hexdigest()
                    cached = await cache.get(cache_key)
                    if cached is not None:
                        cached_results = json.loads(cached.decode("utf-8"))
                        if isinstance(cached_results, list):
                            logger.debug("RAG cache hit for query: %s", query[:50])
                            return cached_results
            except Exception:
                pass

        query_embedding = await self._embeddings.embed(query)
        results = await self._vector_store.search(
            collection=self._collection_name,
            query_embedding=query_embedding,
            top_k=top_k,
            filter=filter,
        )

        # Filter by min_score
        if min_score > 0:
            results = [r for r in results if r.get("score", 0) <= min_score]

        # Store in semantic cache
        if use_cache and results:
            try:
                cache = await self._get_semantic_cache()
                if cache:
                    cache_key = hashlib.sha256(
                        f"{query}:{top_k}:{min_score}".encode()
                    ).hexdigest()
                    await cache.set(
                        cache_key,
                        json.dumps(results, default=str).encode("utf-8"),
                        ttl_sec=300,
                    )
                    logger.debug("RAG cached result for query: %s", query[:50])
            except Exception:
                pass

        return results

    async def delete_document(self, document_id: str) -> None:
        """Remove all chunks for a document from the index."""
        if not await self.is_available():
            return

        # Search for all chunks of this document
        results = await self._vector_store.search(
            collection=self._collection_name,
            query_embedding=[0.0] * self._embeddings.dimension,
            top_k=1000,
            filter={"document_id": document_id},
        )

        chunk_ids = [r["id"] for r in results if r["metadata"].get("document_id") == document_id]
        if chunk_ids:
            await self._vector_store.delete(self._collection_name, chunk_ids)
            logger.info("Deleted %d chunks for document '%s'", len(chunk_ids), document_id)

    async def build_knowledge_context(
        self,
        query: str,
        top_k: int = 3,
        max_chars: int = 2000,
    ) -> str:
        """Build a context string from relevant knowledge for an LLM prompt.

        Args:
            query: The user's query to search against
            top_k: Number of chunks to retrieve
            max_chars: Maximum characters for the context

        Returns:
            Formatted context string for injection into LLM prompts
        """
        results = await self.search(query, top_k=top_k)
        if not results:
            return ""

        context_parts = []
        total_chars = 0

        for r in results:
            doc = r.get("document", "").strip()
            if not doc:
                continue
            if total_chars + len(doc) > max_chars:
                doc = doc[: max_chars - total_chars] + "..."
            context_parts.append(doc)
            total_chars += len(doc)

            if total_chars >= max_chars:
                break

        return "\n\n---\n\n".join(context_parts)

    def _chunk_text(self, text: str, chunk_size: int, overlap: int) -> list[str]:
        """Split text into overlapping chunks at sentence boundaries."""
        if not text:
            return []

        import re

        sentences = re.split(r"(?<=[.!?])\s+", text)
        chunks = []
        current = []
        current_len = 0

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            if current_len + len(sentence) > chunk_size and current:
                chunks.append(" ".join(current))
                # Keep overlap
                overlap_text = " ".join(current)
                overlap_words = overlap_text.split()
                overlap_len = len(" ".join(overlap_words[-max(len(overlap_words) - overlap // 5, 0):]))
                current = current[-max(len(current) - overlap_len // len(sentence) if sentence else 1, 0):]
                current_len = sum(len(s) for s in current)

            current.append(sentence)
            current_len += len(sentence)

        if current:
            chunks.append(" ".join(current))

        return chunks if chunks else [text]


# Singleton
_rag_service: RAGService | None = None


def get_rag_service() -> RAGService:
    global _rag_service
    if _rag_service is None:
        from app.providers.memory import ChromaDBProvider, SentenceTransformerEmbeddings
        from app.config import settings

        vector_store = ChromaDBProvider(
            persist_directory=settings.REDIS_URL or "./chroma_data",
        )
        embeddings = SentenceTransformerEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            device=settings.EMBEDDING_DEVICE,
        )
        _rag_service = RAGService(vector_store=vector_store, embeddings=embeddings)
    return _rag_service
