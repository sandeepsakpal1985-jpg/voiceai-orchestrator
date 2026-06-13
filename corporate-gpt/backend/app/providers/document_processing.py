"""
Document Processing Provider — Unstructured + OCRmyPDF
Thin wrapper around Unstructured library for document parsing and OCRmyPDF for OCR.

Libraries: unstructured[pdf,docx,pptx], ocrmypdf, pytesseract, pillow
"""
import os
import tempfile
from typing import Any, Dict, List, Optional
from pathlib import Path

from app.core.config import settings


class DocumentProcessingProvider:
    """Thin wrapper around Unstructured for enterprise document processing."""
    
    SUPPORTED_FORMATS = {
        ".pdf": "PDF document",
        ".docx": "Word document",
        ".pptx": "PowerPoint presentation",
        ".xlsx": "Excel spreadsheet",
        ".csv": "CSV data",
        ".txt": "Text file",
        ".md": "Markdown",
        ".html": "HTML document",
        ".json": "JSON data",
        ".xml": "XML document",
        ".png": "Image (OCR)",
        ".jpg": "Image (OCR)",
        ".jpeg": "Image (OCR)",
        ".tiff": "Image (OCR)",
        ".bmp": "Image (OCR)",
    }
    
    @classmethod
    def is_supported(cls, filename: str) -> bool:
        """Check if a file format is supported."""
        ext = os.path.splitext(filename)[1].lower()
        return ext in cls.SUPPORTED_FORMATS
    
    @classmethod
    async def extract_text(
        cls,
        file_path: str,
        filename: str,
        ocr: bool = True,
    ) -> Dict[str, Any]:
        """Extract text from a document using Unstructured."""
        ext = os.path.splitext(filename)[1].lower()
        
        # For scanned PDFs, run OCRmyPDF first if OCR is enabled
        if ext == ".pdf" and ocr:
            file_path = await cls._apply_ocr(file_path)
        
        # Use Unstructured to partition the document
        elements = await cls._partition_document(file_path, filename)
        
        # Extract metadata
        text_content = []
        tables = []
        metadata = {
            "page_count": 0,
            "char_count": 0,
            "has_tables": False,
        }
        
        for element in elements:
            text = str(getattr(element, "text", ""))
            if text.strip():
                text_content.append(text)
                metadata["char_count"] += len(text)
            
            # Track tables
            if "Table" in type(element).__name__:
                tables.append(text)
                metadata["has_tables"] = True
        
        return {
            "text": "\n".join(text_content),
            "tables": tables,
            "metadata": metadata,
            "elements": len(elements),
        }
    
    @classmethod
    async def _apply_ocr(cls, file_path: str) -> str:
        """Apply OCR to a scanned PDF using OCRmyPDF."""
        try:
            import ocrmypdf
            
            with tempfile.NamedTemporaryFile(
                suffix=".pdf", delete=False
            ) as tmp:
                output_path = tmp.name
            
            ocrmypdf.ocr(
                file_path,
                output_path,
                force_ocr=True,
                language=settings.OCR_LANGUAGE or "eng",
                skip_text=True,
                progress_bar=False,
            )
            return output_path
        except ImportError:
            print("Warning: ocrmypdf not installed. Skipping OCR.")
            return file_path
        except Exception as e:
            print(f"Warning: OCR failed: {e}. Using original file.")
            return file_path
    
    @classmethod
    async def _partition_document(
        cls,
        file_path: str,
        filename: str,
    ) -> List[Any]:
        """Partition a document using Unstructured."""
        ext = os.path.splitext(filename)[1].lower()
        
        try:
            from unstructured.partition.auto import partition
            
            strategy = "hi_res" if ext in {".pdf", ".png", ".jpg", ".jpeg"} else "fast"
            
            elements = partition(
                filename=file_path,
                strategy=strategy,
                include_page_breaks=True,
            )
            return elements
            
        except ImportError:
            # Fallback: basic text extraction
            print("Warning: unstructured not installed. Using fallback extraction.")
            return await cls._fallback_extract(file_path, ext)
        except Exception as e:
            print(f"Warning: Unstructured partitioning failed: {e}. Using fallback.")
            return await cls._fallback_extract(file_path, ext)
    
    @classmethod
    async def _fallback_extract(
        cls,
        file_path: str,
        ext: str,
    ) -> List[Any]:
        """Fallback text extraction when Unstructured is not available.
        Returns simple objects with .text attribute via a lightweight wrapper.
        """
        class _TextElement:
            def __init__(self, text: str):
                self.text = text
        
        text = ""
        try:
            if ext in (".txt", ".md", ".csv", ".json", ".xml"):
                with open(file_path, "r", encoding="utf-8") as f:
                    text = f.read()
            elif ext == ".pdf":
                from PyPDF2 import PdfReader
                reader = PdfReader(file_path)
                text = "\n".join(page.extract_text() for page in reader.pages)
            elif ext == ".docx":
                from docx import Document
                doc = Document(file_path)
                text = "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            print(f"Fallback extraction failed: {e}")
        
        return [_TextElement(text)] if text.strip() else []
