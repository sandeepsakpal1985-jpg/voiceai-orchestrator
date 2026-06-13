"""Document management upload, list, version control."""
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.document import Document, DocumentVersion
from app.services.document_processor import extract_text, SUPPORTED_FORMATS
from app.services.chunking_service import chunk_text
from app.services.embedding_service import generate_embeddings
from app.services.vector_service import upsert_document_chunks, ensure_collection
from app.services.storage_service import store_file
from app.core.config import settings

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    department_id: str = Form(None),
    category: str = Form(None),
    tags: str = Form(None),
    confidentiality: str = Form("internal"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS and ext not in {".png", ".jpg", ".jpeg", ".gif"}:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    doc_id = str(uuid.uuid4())
    storage_path = await store_file(current_user.organization_id, doc_id, file.filename, file.file)

    raw_text = ""
    metadata = {}
    if ext in SUPPORTED_FORMATS:
        raw_text, metadata = extract_text(storage_path, ext[1:])
    else:
                result = await extract_text(storage_path, filename, ocr=True)
    raw_text = result.get("text", "")

    chunks = chunk_text(raw_text)
    chunk_count = len(chunks)

    tag_list = [t.strip() for t in tags.split(",")] if tags else []
    doc = Document(
        id=doc_id,
        organization_id=current_user.organization_id,
        department_id=department_id,
        filename=storage_path,
        original_filename=file.filename,
        file_type=ext[1:],
        file_size=metadata.get("char_count", 0),
        storage_path=storage_path,
        title=os.path.splitext(file.filename)[0],
        category=category,
        tags=tag_list,
        confidentiality=confidentiality,
        page_count=metadata.get("page_count", 0),
        char_count=metadata.get("char_count", 0),
        chunk_count=chunk_count,
    )
    db.add(doc)

    # Vector indexing
    await ensure_collection(current_user.organization_id)
    embeddings = await generate_embeddings([c["text"] for c in chunks])
    await upsert_document_chunks(doc_id, current_user.organization_id, doc.title or doc.original_filename, chunks, embeddings)
    doc.is_indexed = True

    await db.flush()

    # Version
    db.add(DocumentVersion(document_id=doc_id, version=1, storage_path=storage_path,
                           file_size=doc.file_size, char_count=doc.char_count))

    return {"id": doc_id, "filename": file.filename, "chunks": chunk_count, "status": "indexed"}


@router.get("/")
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List documents with pagination."""
    from sqlalchemy import func as sa_func
    # Get total count
    count_q = select(sa_func.count()).select_from(Document).where(
        Document.organization_id == current_user.organization_id,
        Document.is_active == True,
    )
    total = (await db.execute(count_q)).scalar() or 0
    # Get page
    result = await db.execute(
        select(Document).where(Document.organization_id == current_user.organization_id, Document.is_active == True)
        .order_by(Document.updated_at.desc())
        .limit(page_size).offset((page - 1) * page_size)
    )
    return {
        "items": result.scalars().all(),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/{doc_id}")
async def get_document(doc_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.organization_id == current_user.organization_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404)
    return doc


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.organization_id == current_user.organization_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404)
    from app.services.vector_service import delete_document_chunks
    await delete_document_chunks(doc_id, current_user.organization_id)
    from app.services.storage_service import delete_file
    await delete_file(doc.storage_path)
    doc.is_active = False
    return {"status": "deleted"}
