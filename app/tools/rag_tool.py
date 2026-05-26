"""
RAG Tool — Knowledge base retrieval tool for LLM tool calling.

This tool allows the LLM to search the knowledge base during
conversations to provide informed responses.
"""

import logging

from app.tools.base import ToolDefinition, get_tool_registry

logger = logging.getLogger("voiceai.tools.rag")


async def search_knowledge_base(query: str, top_k: int = 3) -> str:
    """Search the knowledge base for relevant information.

    Args:
        query: Natural language search query
        top_k: Number of results to return (max 10)

    Returns:
        Formatted search results with relevant content
    """
    try:
        from app.services.rag import get_rag_service

        rag = get_rag_service()
        await rag.initialize()

        if not await rag.is_available():
            return "Knowledge base is not available. No embeddings/vector store configured."

        results = await rag.search(query, top_k=min(top_k, 10))

        if not results:
            return f"No results found for query: '{query}'"

        formatted = []
        for i, r in enumerate(results, 1):
            doc = r.get("document", "").strip()
            score = r.get("score", 0)
            metadata = r.get("metadata", {})
            source = metadata.get("document_id", "unknown")

            if doc:
                formatted.append(f"[{i}] (source: {source}, relevance: {score:.2f})\n{doc[:300]}")

        return "Knowledge base results:\n\n" + "\n\n".join(formatted)

    except Exception as e:
        logger.warning("Knowledge base search error: %s", e)
        return f"Knowledge base search unavailable: {e}"


def register_rag_tools() -> None:
    """Register RAG tools with the global tool registry."""
    registry = get_tool_registry()

    registry.register(
        "search_knowledge_base",
        ToolDefinition(
            name="search_knowledge_base",
            description="Search the knowledge base for relevant information to answer questions",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant information",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (1-10)",
                    },
                },
                "required": ["query"],
            },
            handler=search_knowledge_base,
        ),
    )

    logger.info("Registered RAG tool: search_knowledge_base")
