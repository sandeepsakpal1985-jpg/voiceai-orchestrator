"""
Vector Search Service — Delegates to LlamaIndex + Qdrant.
Kept as thin adapter for backward compatibility.
"""
from typing import Any, Dict, List, Optional

from app.providers.rag import RAGProvider


async def ensure_collection(organization_id: str = "default") -> bool:
    """Ensure the Qdrant collection exists for a tenant."""
    return await RAGProvider.initialize_collection(organization_id)


async def upsert_document_chunks(
    document_id: str,
    organization_id: str,
    document_name: str,
    chunks: List[Dict[str, Any]],
    embeddings: List[List[float]],
) -> int:
    """Upsert document chunks (delegates to LlamaIndex indexing)."""
    documents = []
    for chunk in chunks:
        documents.append({
            "text": chunk.get("text", ""),
            "document_id": document_id,
            "filename": document_name,
            "metadata": {
                "chunk_index": chunk.get("chunk_index", 0),
                "start_char": chunk.get("start_char", 0),
                "end_char": chunk.get("end_char", 0),
            },
        })
    
    return await RAGProvider.index_documents(
        organization_id=organization_id,
        documents=documents,
    )


async def search_similar(
    organization_id: str,
    query_text: str,
    top_k: int = 10,
    confidence_threshold: float = 0.6,
    department_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Search similar documents using LlamaIndex (handles embedding internally)."""
    return await RAGProvider.search(
        organization_id=organization_id,
        query=query_text,
        top_k=top_k,
        similarity_threshold=confidence_threshold,
        filters={"department": department_filter} if department_filter else None,
    )


async def delete_document_chunks(
    document_id: str,
    organization_id: str = "default",
) -> bool:
    """Delete all chunks for a document from the vector store."""
    return await RAGProvider.delete_document_chunks(
        organization_id=organization_id,
        document_id=document_id,
    )
