"""
Document Processing Service — Delegates to Unstructured + OCRmyPDF.
Supports PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, HTML, JSON, XML, ZIP, Images (OCR).
"""
import os
from typing import Any, Dict, List

from app.providers.document_processing import DocumentProcessingProvider


class DocumentProcessor:
    """Enterprise document processor wrapping Unstructured."""
    
    SUPPORTED_FORMATS = DocumentProcessingProvider.SUPPORTED_FORMATS
    
    @staticmethod
    def is_supported(filename: str) -> bool:
        return DocumentProcessingProvider.is_supported(filename)
    
    @staticmethod
    async def extract_text(
        file_path: str,
        filename: str,
        ocr: bool = True,
    ) -> Dict[str, Any]:
        """Extract text and metadata from a document."""
        return await DocumentProcessingProvider.extract_text(
            file_path=file_path,
            filename=filename,
            ocr=ocr,
        )
    
    @staticmethod
    async def extract_and_chunk(
        file_path: str,
        filename: str,
        ocr: bool = True,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> List[Dict[str, Any]]:
        """Extract text and split into chunks for indexing."""
        result = await DocumentProcessingProvider.extract_text(
            file_path=file_path,
            filename=filename,
            ocr=ocr,
        )
        
        text = result.get("text", "")
        
        # Basic chunking (LlamaIndex will re-chunk during indexing)
        chunks = []
        for i in range(0, len(text), chunk_size - chunk_overlap):
            chunk_text = text[i:i + chunk_size]
            if chunk_text.strip():
                chunks.append({
                    "text": chunk_text,
                    "start_char": i,
                    "end_char": i + len(chunk_text),
                    "chunk_index": len(chunks),
                })
        
        return chunks

# --- Module-level shortcuts (for backward compatibility) ---
SUPPORTED_FORMATS = DocumentProcessor.SUPPORTED_FORMATS
is_supported = DocumentProcessor.is_supported
extract_text = DocumentProcessor.extract_text
extract_and_chunk = DocumentProcessor.extract_and_chunk
