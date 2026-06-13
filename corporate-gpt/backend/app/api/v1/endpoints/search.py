"""Semantic, keyword, and hybrid search."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.document import Document
from app.services.embedding_service import generate_embeddings
from app.services.vector_service import search_similar
from app.services.citation_service import build_citations
from app.core.config import settings

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/")
async def search(
    q: str = Query(..., description="Search query"),
    department: str = Query(None),
    doc_type: str = Query(None),
    author: str = Query(None),
    tag: str = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Semantic search
    vector_results = await search_similar(
        current_user.organization_id, q,
        top_k=getattr(settings, 'SEARCH_TOP_K', 10),
        department_filter=department,
    )

    # Build citation results
    results = build_citations(vector_results)

    # Keyword fallback
    keyword_results = []
    if not results:
        stmt = select(Document).where(
            Document.organization_id == current_user.organization_id,
            Document.is_active == True,
            or_(
                Document.title.ilike(f"%{q}%"),
                Document.description.ilike(f"%{q}%"),
                Document.tags.any(q),
            ),
        )
        if department:
            stmt = stmt.where(Document.department.has(name=department))
        if doc_type:
            stmt = stmt.where(Document.file_type == doc_type)
        kw_result = await db.execute(stmt.limit(page_size).offset((page - 1) * page_size))
        for d in kw_result.scalars().all():
            keyword_results.append({
                "document_id": d.id,
                "document_name": d.title or d.original_filename,
                "snippet": f"Keyword match: {d.description or 'No description'}",
                "confidence_score": 0.8,
            })

    return {
        "query": q,
        "semantic_results": results,
        "keyword_results": keyword_results,
        "total": len(results) + len(keyword_results),
    }
