"""Citation engine for RAG results."""

from typing import Any, Dict, List, Optional


def build_citations(search_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    citations = []
    for r in search_results:
        payload = r.get("payload", {})
        score = r.get("score", 0)
        if not payload.get("text"):
            continue
        citations.append({
            "document_id": payload.get("document_id"),
            "document_name": payload.get("document_name", "Unknown Document"),
            "snippet": payload["text"][:300],
            "page_number": payload.get("page_number"),
            "section": payload.get("section"),
            "confidence_score": round(score, 2),
            "chunk_index": payload.get("chunk_index"),
        })
    return citations
