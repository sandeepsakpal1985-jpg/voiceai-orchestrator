"""
Document processing Celery tasks.
Processes uploaded documents through the full pipeline:
Extract Text → OCR → Chunking → Embeddings → Vector Indexing.
"""
import asyncio
import logging
import os

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_session_factory
from app.models.document import Document
from app.services.document_processor import DocumentProcessor
from app.services.chunking_service import chunk_text
from app.services.embedding_service import generate_embeddings
from app.services.vector_service import ensure_collection, upsert_document_chunks

logger = logging.getLogger("corpgpt.document_tasks")


@celery_app.task(bind=True, max_retries=3, soft_time_limit=300, acks_late=True)
def process_document(self, document_id: str, organization_id: str, storage_path: str, filename: str):
    """Async document processing pipeline.
    
    Steps:
    1. Extract text from file (with OCR if needed)
    2. Split into chunks
    3. Generate embeddings
    4. Index in Qdrant
    """
    try:

        # 1. Extract text
        result = DocumentProcessor.extract_text(storage_path, filename)
        raw_text = result.get("text", "")
        if not raw_text.strip():
            return {"status": "skipped", "document_id": document_id, "reason": "No text extracted"}

        # 2. Chunk
        chunks = chunk_text(raw_text)
        if not chunks:
            return {"status": "skipped", "document_id": document_id, "reason": "No chunks generated"}

        # 3-4. Embed + Index
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            loop.run_until_complete(ensure_collection(organization_id))
            embeddings = loop.run_until_complete(generate_embeddings([c["text"] for c in chunks]))
            loop.run_until_complete(upsert_document_chunks(
                document_id, organization_id, os.path.basename(filename), chunks, embeddings
            ))
        finally:
            loop.close()

        # 5. Update DB record
        async def _update_db():
            async with get_session_factory() as session:
                result = await session.execute(
                    select(Document).where(Document.id == document_id)
                )
                doc = result.scalar_one_or_none()
                if doc:
                    doc.is_indexed = True
                    doc.chunk_count = len(chunks)
                    await session.commit()

        loop2 = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop2)
            loop2.run_until_complete(_update_db())
        finally:
            loop2.close()

        return {
            "status": "processed",
            "document_id": document_id,
            "chunks": len(chunks),
            "char_count": len(raw_text),
        }

    except Exception as e:
        logger.error("Document processing failed for %s: %s", document_id, e)
        raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))


@celery_app.task(bind=True, max_retries=3, soft_time_limit=300)
def reindex_document(self, document_id: str, organization_id: str):
    """Re-index a document in the vector store.
    Useful after document updates or vector store rebuilds.
    """
    try:
        from app.models.document import Document
        from app.core.database import get_session_factory
        from sqlalchemy import select

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)

            async def _reindex():
                async with get_session_factory() as session:
                    result = await session.execute(
                        select(Document).where(Document.id == document_id)
                    )
                    doc = result.scalar_one_or_none()
                    if doc and doc.storage_path:
                        # Re-process through pipeline
                        process_document.delay(
                            document_id, organization_id, doc.storage_path, doc.filename
                        )

            loop.run_until_complete(_reindex())
        finally:
            loop.close()

        return {"status": "reindexed", "document_id": document_id}
    except Exception as e:
        logger.error("Re-index failed for %s: %s", document_id, e)
        raise self.retry(exc=e)


@celery_app.task(bind=True, max_retries=3)
def delete_vector_index(self, document_id: str, organization_id: str = "default"):
    """Remove document chunks from vector store."""
    try:
        from app.services.vector_service import delete_document_chunks

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            loop.run_until_complete(delete_document_chunks(document_id, organization_id))
        finally:
            loop.close()

        return {"status": "deleted", "document_id": document_id}
    except Exception as e:
        logger.error("Vector delete failed for %s: %s", document_id, e)
        return {"status": "failed", "document_id": document_id, "error": str(e)}
