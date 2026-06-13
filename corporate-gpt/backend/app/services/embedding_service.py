"""Embedding service for vector search."""
from typing import List, Optional
from openai import AsyncOpenAI
from app.core.config import settings

_client: Optional[AsyncOpenAI] = None

def get_client() -> Optional[AsyncOpenAI]:
    global _client
    if _client is None and settings.OPENAI_API_KEY:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL, timeout=30)
    return _client

async def generate_embeddings(texts: List[str], model: Optional[str] = None) -> List[List[float]]:
    client = get_client()
    if not client:
        dim = getattr(settings, 'QDRANT_VECTOR_SIZE', 1536)
        return [[0.0] * dim for _ in texts]
    response = await client.embeddings.create(model=model or settings.EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]
