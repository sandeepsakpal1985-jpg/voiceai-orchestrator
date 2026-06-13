"""
RAG Service — Enterprise RAG with 3 AI modes.
Delegates to LlamaIndex for indexing, retrieval, and querying.
"""
from typing import Any, AsyncGenerator, Dict, List, Optional

from llama_index.core import Settings as LiSettings

from app.core.config import settings
from app.providers.rag import RAGProvider
from app.providers.analytics import AnalyticsProvider
from app.services.llm_service import get_llm, get_embed_model, LLMService


class RAGService:
    """Enterprise RAG service with three AI modes."""
    
    def __init__(self):
        # Configure LlamaIndex global settings
        LiSettings.llm = get_llm()
        LiSettings.embed_model = get_embed_model()
    
    async def index_documents(
        self,
        organization_id: str,
        documents: List[Dict[str, Any]],
    ) -> int:
        """Index documents using LlamaIndex + Qdrant."""
        count = await RAGProvider.index_documents(
            organization_id=organization_id,
            documents=documents,
        )
        
        AnalyticsProvider.capture(
            distinct_id=organization_id,
            event="documents_indexed",
            properties={"count": count},
        )
        
        return count
    
    async def search(
        self,
        organization_id: str,
        query: str,
        department_filter: Optional[str] = None,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """Semantic search across indexed documents."""
        filters = None
        if department_filter:
            filters = {"department": department_filter}
        
        results = await RAGProvider.search(
            organization_id=organization_id,
            query=query,
            top_k=top_k,
            filters=filters,
        )
        
        AnalyticsProvider.capture(
            distinct_id=organization_id,
            event="search_executed",
            properties={
                "query_length": len(query),
                "results_count": len(results),
            },
        )
        
        return results
    
    async def query(
        self,
        organization_id: str,
        query: str,
        mode: str = "strict",
    ) -> Dict[str, Any]:
        """Query with RAG. Three modes:
        
        - strict: Answer ONLY from retrieved documents
        - general: Company knowledge first, supplement with LLM reasoning
        - expert: Answer as subject matter expert using company context
        """
        if mode == "strict":
            return await self._strict_query(organization_id, query)
        elif mode == "general":
            return await self._general_query(organization_id, query)
        elif mode == "expert":
            return await self._expert_query(organization_id, query)
        else:
            return await self._strict_query(organization_id, query)
    
    async def _strict_query(
        self,
        organization_id: str,
        query: str,
    ) -> Dict[str, Any]:
        """STRICT mode: Answer only from retrieved documents."""
        # First retrieve relevant context
        results = await self.search(organization_id, query, top_k=5)
        
        if not results:
            return {
                "answer": "I could not find this information in company knowledge.",
                "citations": [],
                "mode": "strict",
            }
        
        # Build context from retrieved documents
        context = "\n\n".join(
            f"[Document: {r.get('filename', 'Unknown')}]\n{r['text']}"
            for r in results
        )
        
        # Strict prompt
        system_prompt = (
            "You are a strict enterprise knowledge assistant. "
            "Answer ONLY using the provided context. "
            "If the context doesn't contain the answer, say: "
            "'I could not find this information in company knowledge.' "
            "Do not use any external knowledge or make up information."
        )
        
        from app.services.llm_service import LLMService
        llm = LLMService()
        answer = await llm.complete(
            prompt=f"Context:\n{context}\n\nQuestion: {query}",
            system_prompt=system_prompt,
        )
        
        citations = [
            {
                "filename": r.get("filename", "Unknown"),
                "snippet": r["text"][:200],
                "score": r.get("score", 0),
            }
            for r in results[:3]
        ]
        
        AnalyticsProvider.capture(
            distinct_id=organization_id,
            event="query_completed",
            properties={"mode": "strict", "has_answer": "not found" not in answer.lower()},
        )
        
        return {"answer": answer, "citations": citations, "mode": "strict"}
    
    async def _general_query(
        self,
        organization_id: str,
        query: str,
    ) -> Dict[str, Any]:
        """GENERAL mode: Company knowledge first, supplement with LLM reasoning."""
        results = await self.search(organization_id, query, top_k=3)
        context = "\n\n".join(
            f"[Document: {r.get('filename', 'Unknown')}]\n{r['text']}"
            for r in results
        ) if results else "No relevant documents found."
        
        system_prompt = (
            "You are a helpful enterprise assistant. "
            "Use company knowledge first. If the provided context "
            "is insufficient, supplement with your general knowledge, "
            "but clearly indicate what is from company docs vs general knowledge."
        )
        
        from app.services.llm_service import LLMService
        llm = LLMService()
        answer = await llm.complete(
            prompt=f"Company Context:\n{context}\n\nQuestion: {query}",
            system_prompt=system_prompt,
        )
        
        citations = [
            {"filename": r.get("filename", "Unknown"), "snippet": r["text"][:200]}
            for r in results[:3]
        ]
        
        return {"answer": answer, "citations": citations, "mode": "general"}
    
    async def _expert_query(
        self,
        organization_id: str,
        query: str,
    ) -> Dict[str, Any]:
        """EXPERT mode: Subject matter expert using company context."""
        results = await self.search(organization_id, query, top_k=5)
        context = "\n\n".join(
            f"[Document: {r.get('filename', 'Unknown')}]\n{r['text']}"
            for r in results
        ) if results else "No relevant documents found."
        
        system_prompt = (
            "You are a senior subject matter expert at this company. "
            "Provide a comprehensive, expert-level answer using company documentation "
            "as your primary source. Include specific details, procedures, and "
            "references. If the documents lack certain information, note the gap "
            "clearly and suggest where this information might be found."
        )
        
        from app.services.llm_service import LLMService
        llm = LLMService()
        answer = await llm.complete(
            prompt=f"Company Documentation:\n{context}\n\nExpert Question: {query}",
            system_prompt=system_prompt,
        )
        
        return {"answer": answer, "citations": results[:5], "mode": "expert"}
    
    async def delete_document(self, organization_id: str, document_id: str):
        """Delete all indexed chunks for a document."""
        await RAGProvider.delete_document_chunks(organization_id, document_id)

    async def stream_query(
        self,
        organization_id: str,
        query: str,
        mode: str = "strict",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream a query response token-by-token via SSE.

        Supports 'strict' mode streaming. For 'general' and 'expert' modes,
        falls back to returning the full response as a single token.

        Yields:
            {"type": "token", "content": "..."} for each token
            {"type": "citations", "citations": [...]} at the end
            {"type": "done"} when complete
        """
        # For non-strict modes, fall back to full response
        if mode != "strict":
            result = await self.query(organization_id, query, mode=mode)
            yield {"type": "token", "content": result["answer"]}
            yield {"type": "citations", "citations": result.get("citations", [])}
            yield {"type": "done"}
            return

        # Get context first
        results = await self.search(organization_id, query, top_k=5)

        if not results:
            yield {
                "type": "token",
                "content": "I could not find this information in company knowledge.",
            }
            yield {"type": "citations", "citations": []}
            yield {"type": "done"}
            return

        context = "\n\n".join(
            f"[Document: {r.get('filename', 'Unknown')}]\n{r['text']}"
            for r in results
        )

        system_prompt = (
            "You are a strict enterprise knowledge assistant. "
            "Answer ONLY using the provided context. "
            "If the context doesn't contain the answer, say: "
            "'I could not find this information in company knowledge.' "
            "Do not use any external knowledge or make up information."
        )

        llm = LLMService()
        full_content = ""
        async for token in llm.stream_complete(
            prompt=f"Context:\n{context}\n\nQuestion: {query}",
            system_prompt=system_prompt,
        ):
            full_content += token
            yield {"type": "token", "content": token}

        citations = [
            {
                "filename": r.get("filename", "Unknown"),
                "snippet": r["text"][:200],
                "score": r.get("score", 0),
            }
            for r in results[:3]
        ]

        yield {"type": "citations", "citations": citations}
        yield {"type": "done"}

        AnalyticsProvider.capture(
            distinct_id=organization_id,
            event="query_streamed",
            properties={"mode": "strict", "char_count": len(full_content)},
        )
