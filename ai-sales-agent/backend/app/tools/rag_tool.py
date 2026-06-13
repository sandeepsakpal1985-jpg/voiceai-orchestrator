"""
RAG Tool — Knowledge base retrieval tool for LLM tool calling.
"""

import logging

from app.tools.base import ToolDefinition, get_tool_registry

logger = logging.getLogger("ai_sales_agent.tools.rag")


async def search_knowledge_base(query: str, top_k: int = 3) -> str:
    """Search the knowledge base for relevant information."""
    try:
        from app.services.rag import get_rag_service
        rag = get_rag_service()
        await rag.initialize()
        if not await rag.is_available():
            return "Knowledge base is not available."
        results = await rag.search(query, top_k=min(top_k, 10))
        if not results:
            return f"No results found for: '{query}'"
        formatted = []
        for i, r in enumerate(results, 1):
            doc = r.get("document", "").strip()
            if doc:
                formatted.append(f"[{i}] {doc[:300]}")
        return "Knowledge base results:\n\n" + "\n\n".join(formatted)
    except Exception as e:
        return f"Knowledge base search unavailable: {e}"


def register_rag_tools() -> None:
    """Register RAG tools with the global tool registry."""
    registry = get_tool_registry()
    registry.register("search_knowledge_base", ToolDefinition(
        name="search_knowledge_base",
        description="Search the knowledge base for relevant information to answer questions",
        parameters={"type": "object", "properties": {
            "query": {"type": "string", "description": "Search query"},
            "top_k": {"type": "integer", "description": "Number of results (1-10)"},
        }, "required": ["query"]},
        handler=search_knowledge_base,
    ))
    logger.info("Registered RAG tool")
