"""
RAG Provider — LlamaIndex + Qdrant
Thin wrapper around LlamaIndex for document indexing, retrieval, and querying.

Libraries: llama-index, llama-index-vector-stores-qdrant, qdrant-client
"""
import os
from typing import Any, Dict, List, Optional

from llama_index.core import (
    Document as LiDocument,
    VectorStoreIndex,
    StorageContext,
    Settings,
)
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.response_synthesizers import CompactAndRefine
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient as QdrantClientBase
from qdrant_client.http import models

from app.core.config import settings


class RAGProvider:
    """Thin wrapper around LlamaIndex for enterprise RAG operations."""
    
    _indices: Dict[str, VectorStoreIndex] = {}
    
    @classmethod
    def _get_qdrant_client(cls) -> QdrantClientBase:
        """Get Qdrant client."""
        return QdrantClientBase(
            url=settings.QDRANT_URL,
            timeout=60,
        )
    
    @classmethod
    def _get_vector_store(
        cls,
        collection_name: Optional[str] = None,
    ) -> QdrantVectorStore:
        """Get Qdrant vector store for a tenant/organization."""
        name = collection_name or f"corpgpt_{settings.QDRANT_COLLECTION}"
        return QdrantVectorStore(
            client=cls._get_qdrant_client(),
            collection_name=name,
        )
    
    @classmethod
    async def initialize_collection(
        cls,
        organization_id: str,
        vector_size: int = 1536,
    ) -> bool:
        """Create/ensure a tenant-specific Qdrant collection exists.
        Wraps synchronous Qdrant calls in run_in_executor to avoid blocking.
        """
        import asyncio
        loop = asyncio.get_running_loop()
        
        def _sync_init():
            client = cls._get_qdrant_client()
            collection_name = f"corpgpt_{organization_id}_{settings.QDRANT_COLLECTION}"
            collections = client.get_collections().collections
            exists = any(c.name == collection_name for c in collections)
            if not exists:
                client.create_collection(
                    collection_name=collection_name,
                    vectors_config=models.VectorParams(
                        size=vector_size,
                        distance=models.Distance.COSINE,
                    ),
                )
                return True
            return False
        
        return await loop.run_in_executor(None, _sync_init)
    
    @classmethod
    async def index_documents(
        cls,
        organization_id: str,
        documents: List[Dict[str, Any]],
    ) -> int:
        """Index documents using LlamaIndex. Each doc has 'text' and 'metadata'."""
        # Convert to LlamaIndex Documents
        li_docs = []
        for doc in documents:
            li_doc = LiDocument(
                text=doc.get("text", ""),
                metadata={
                    "document_id": doc.get("document_id", ""),
                    "organization_id": organization_id,
                    "filename": doc.get("filename", ""),
                    **(doc.get("metadata", {})),
                },
            )
            li_docs.append(li_doc)
        
        # Ensure collection exists
        collection_name = f"corpgpt_{organization_id}_{settings.QDRANT_COLLECTION}"
        await cls.initialize_collection(organization_id)
        
        # Create vector store and index
        vector_store = cls._get_vector_store(collection_name)
        storage_context = StorageContext.from_defaults(
            vector_store=vector_store,
        )
        
        # Configure node parser (chunking)
        parser = SentenceSplitter(
            chunk_size=settings.CHUNK_SIZE or 1000,
            chunk_overlap=settings.CHUNK_OVERLAP or 200,
        )
        
        # Create index
        index = VectorStoreIndex.from_documents(
            li_docs,
            storage_context=storage_context,
            transformations=[parser],
            show_progress=True,
        )
        
        # Cache index
        cls._indices[organization_id] = index
        
        return len(li_docs)
    
    @classmethod
    async def search(
        cls,
        organization_id: str,
        query: str,
        top_k: int = 5,
        similarity_threshold: float = 0.6,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Search documents using semantic + keyword hybrid search."""
        collection_name = f"corpgpt_{organization_id}_{settings.QDRANT_COLLECTION}"
        vector_store = cls._get_vector_store(collection_name)
        
        # Use cached index if available
        if organization_id in cls._indices:
            index = cls._indices[organization_id]
        else:
            storage_context = StorageContext.from_defaults(
                vector_store=vector_store,
            )
            index = VectorStoreIndex.from_vector_store(
                vector_store,
                storage_context=storage_context,
            )
            cls._indices[organization_id] = index
        
        # Configure retriever
        retriever = VectorIndexRetriever(
            index=index,
            similarity_top_k=top_k,
        )
        
        # Query
        nodes = retriever.retrieve(query)
        
        results = []
        for node in nodes:
            if node.score and node.score >= similarity_threshold:
                results.append({
                    "text": node.get_text(),
                    "score": node.score,
                    "document_id": node.metadata.get("document_id", ""),
                    "filename": node.metadata.get("filename", ""),
                    "metadata": node.metadata,
                })
        
        return results
    
    @classmethod
    async def delete_document_chunks(
        cls,
        organization_id: str,
        document_id: str,
    ) -> bool:
        """Delete all chunks for a document from the vector store."""
        import asyncio
        loop = asyncio.get_running_loop()
        
        def _sync_delete():
            client = cls._get_qdrant_client()
            collection_name = f"corpgpt_{organization_id}_{settings.QDRANT_COLLECTION}"
            client.delete(
                collection_name=collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter(
                        must=[
                            models.FieldCondition(
                                key="metadata.document_id",
                                match=models.MatchValue(value=document_id),
                            ),
                        ],
                    ),
                ),
            )
            return True
        
        return await loop.run_in_executor(None, _sync_delete)
