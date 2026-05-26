"""Knowledge Base Router — RAG-powered document indexing and semantic search.

Provides API endpoints for uploading, indexing, searching, and managing
knowledge documents. Uses the RAGService (VectorStore + Embeddings)
under the hood for semantic retrieval.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form

from app.models.schemas import (
    SearchRequest,
    IndexRequest,
)
from app.services.rag import get_rag_service

logger = logging.getLogger("voiceai.knowledge")

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


# ── In-Memory Document Store ───────────────────────────────────────

_documents: dict[str, dict] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _get_doc_or_404(doc_id: str) -> dict:
    doc = _documents.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# ── Document CRUD ──────────────────────────────────────────────────


@router.get("", response_model=dict)
async def list_documents(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """List all knowledge documents with optional filtering."""
    docs = list(_documents.values())

    if status:
        docs = [d for d in docs if d.get("status") == status]
    if search:
        search_lower = search.lower()
        docs = [d for d in docs if search_lower in d.get("name", "").lower()]

    docs.sort(key=lambda d: d.get("updated_at", ""), reverse=True)

    return {
        "documents": docs,
        "total": len(docs),
        "indexed": len([d for d in docs if d.get("status") == "indexed"]),
        "processing": len([d for d in docs if d.get("status") == "processing"]),
        "failed": len([d for d in docs if d.get("status") == "failed"]),
    }


@router.get("/{document_id}", response_model=dict)
async def get_document(document_id: str):
    """Get a single document by ID."""
    doc = _get_doc_or_404(document_id)
    return {"document": doc}


@router.post("/upload", response_model=dict, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
):
    """Upload a document for indexing. Supports PDF, DOCX, TXT, CSV files."""
    doc_id = str(uuid.uuid4())
    content_bytes = await file.read()
    file_name = name or file.filename or "unnamed"
    file_extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "unknown"
    file_size = len(content_bytes)
    now = _now()

    content_text = ""
    try:
        content_text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            content_text = content_bytes.decode("latin-1")
        except Exception:
            content_text = f"[Binary file: {file_extension}, size: {file_size} bytes]"

    document = {
        "id": doc_id,
        "name": file_name,
        "file_type": file_extension,
        "file_size": file_size,
        "status": "processing",
        "tags": tags.split(",") if tags else [],
        "content_preview": content_text[:500],
        "chunk_count": 0,
        "created_at": now,
        "updated_at": now,
    }

    _documents[doc_id] = document
    logger.info("Uploaded document '%s' (id=%s, size=%d)", file_name, doc_id, file_size)

    try:
        rag = get_rag_service()
        await rag.initialize()
        chunk_count = await rag.index_document(
            document_id=doc_id,
            content=content_text,
            metadata={
                "name": file_name,
                "file_type": file_extension,
                "file_size": file_size,
            },
        )
        document["status"] = "indexed" if chunk_count > 0 else "failed"
        document["chunk_count"] = chunk_count
        document["updated_at"] = _now()
        _documents[doc_id] = document
        logger.info("Indexed document '%s' (%d chunks)", file_name, chunk_count)
    except Exception as e:
        logger.warning("Failed to index document '%s': %s", file_name, e)
        document["status"] = "failed"
        _documents[doc_id] = document

    return {"document": document}


@router.post("/index", response_model=dict, status_code=201)
async def index_content(body: IndexRequest):
    """Index plain text content directly (without file upload)."""
    doc_id = str(uuid.uuid4())
    now = _now()

    document = {
        "id": doc_id,
        "name": body.content[:50] + "..." if len(body.content) > 50 else body.content,
        "file_type": "text",
        "file_size": len(body.content.encode("utf-8")),
        "status": "processing",
        "tags": body.tags or [],
        "content_preview": body.content[:500],
        "chunk_count": 0,
        "created_at": now,
        "updated_at": now,
    }

    _documents[doc_id] = document

    try:
        rag = get_rag_service()
        await rag.initialize()
        chunk_count = await rag.index_document(
            document_id=doc_id,
            content=body.content,
            metadata={"source": "api_index", "tags": body.tags or []},
        )
        document["status"] = "indexed" if chunk_count > 0 else "failed"
        document["chunk_count"] = chunk_count
        _documents[doc_id] = document
    except Exception as e:
        logger.warning("Failed to index content: %s", e)
        document["status"] = "failed"
        _documents[doc_id] = document

    return {"document": document}


# ── Semantic Search ────────────────────────────────────────────────


@router.post("/search", response_model=dict)
async def search_knowledge(body: SearchRequest):
    """Search the knowledge base using semantic (vector) search."""
    rag = get_rag_service()
    await rag.initialize()

    results = await rag.search(
        query=body.query,
        top_k=body.top_k or 5,
        filter=body.filter,
        min_score=body.min_score or 0.0,
    )

    return {
        "results": results,
        "total": len(results),
        "query": body.query,
    }


@router.post("/context", response_model=dict)
async def build_knowledge_context(
    query: str = Query(..., description="The query to build context for")
):
    """Build a formatted context string from relevant knowledge for LLM prompts."""
    rag = get_rag_service()
    await rag.initialize()

    context = await rag.build_knowledge_context(query=query, top_k=3)
    return {
        "context": context,
        "has_context": bool(context),
    }


# ── Document Management ────────────────────────────────────────────


@router.delete("/{document_id}", response_model=dict)
async def delete_document(document_id: str):
    """Delete a document and remove its vector index entries."""
    _get_doc_or_404(document_id)

    try:
        rag = get_rag_service()
        await rag.delete_document(document_id)
    except Exception as e:
        logger.warning("Failed to remove document from vector index: %s", e)

    del _documents[document_id]
    logger.info("Deleted document (id=%s)", document_id)
    return {"success": True}


@router.post("/{document_id}/reindex", response_model=dict)
async def reindex_document(document_id: str):
    """Re-index a document (delete and re-embed all chunks)."""
    doc = _get_doc_or_404(document_id)
    content = doc.get("content_preview", "")
    if not content:
        raise HTTPException(status_code=400, detail="Document has no content to re-index")

    try:
        rag = get_rag_service()
        await rag.delete_document(document_id)
    except Exception:
        pass

    try:
        rag = get_rag_service()
        chunk_count = await rag.index_document(
            document_id=document_id,
            content=content,
            metadata={"name": doc.get("name"), "file_type": doc.get("file_type")},
        )
        doc["status"] = "indexed" if chunk_count > 0 else "failed"
        doc["chunk_count"] = chunk_count
        doc["updated_at"] = _now()
        _documents[document_id] = doc
    except Exception as e:
        doc["status"] = "failed"
        _documents[document_id] = doc
        raise HTTPException(status_code=500, detail=f"Re-indexing failed: {e}")

    return {"document": doc}


# ── RAG Status ─────────────────────────────────────────────────────


@router.get("/rag/status", response_model=dict)
async def rag_status():
    """Check if the RAG service is available and get collection stats."""
    rag = get_rag_service()
    await rag.initialize()

    return {
        "available": await rag.is_available(),
        "collection": "knowledge_base",
        "document_count": len(_documents),
        "indexed_count": len([d for d in _documents.values() if d.get("status") == "indexed"]),
    }
