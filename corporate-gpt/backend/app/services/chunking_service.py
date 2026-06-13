"""Document chunking strategies."""

from typing import List, Optional
from app.core.config import settings


def chunk_text(text: str, chunk_size: Optional[int] = None, overlap: Optional[int] = None) -> List[dict]:
    size = chunk_size or settings.CHUNK_SIZE
    ov = overlap or settings.CHUNK_OVERLAP
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk_text = text[start:end]
        if not chunk_text.strip():
            start = end
            continue
        chunks.append({"text": chunk_text, "start_char": start, "end_char": end, "chunk_index": len(chunks)})
        start = end - ov
    return chunks


def chunk_by_paragraph(text: str, max_chars: int = 1500) -> List[dict]:
    paragraphs = text.split("\n\n")
    chunks = []
    current = []
    current_len = 0
    for p in paragraphs:
        if current_len + len(p) > max_chars and current:
            chunks.append({"text": "\n\n".join(current), "chunk_index": len(chunks)})
            current = []
            current_len = 0
        current.append(p)
        current_len += len(p)
    if current:
        chunks.append({"text": "\n\n".join(current), "chunk_index": len(chunks)})
    return chunks
