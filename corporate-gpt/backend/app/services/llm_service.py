"""
LLM Service — OpenAI-compatible with Langfuse observability.
Consolidated: get_llm() returns LlamaIndex LLM, LLMService uses it.
"""
from typing import Any, AsyncGenerator, Dict, List, Optional

from llama_index.llms.openai import OpenAI as LiOpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

from app.core.config import settings
from app.providers.observability import ObservabilityProvider


def get_llm(**kwargs) -> LiOpenAI:
    """Get LlamaIndex-compatible LLM for use with LlamaIndex."""
    return LiOpenAI(
        model=kwargs.get("model", settings.LLM_MODEL or "gpt-4o-mini"),
        api_key=kwargs.get("api_key", settings.OPENAI_API_KEY or "ollama"),
        api_base=kwargs.get("api_base", settings.OPENAI_BASE_URL or "http://localhost:11434/v1"),
        temperature=kwargs.get("temperature", 0.1),
        max_tokens=kwargs.get("max_tokens", 2048),
    )


def get_embed_model(**kwargs) -> OpenAIEmbedding:
    """Get LlamaIndex-compatible embedding model."""
    return OpenAIEmbedding(
        model=kwargs.get("model", settings.EMBEDDING_MODEL or "text-embedding-3-small"),
        api_key=kwargs.get("api_key", settings.OPENAI_API_KEY or "ollama"),
        api_base=kwargs.get("api_base", settings.OPENAI_BASE_URL or "http://localhost:11434/v1"),
    )


class LLMService:
    """Enterprise LLM service with Langfuse observability.
    Uses LlamaIndex's OpenAI LLM under the hood for consistency.
    """
    
    def __init__(self):
        ObservabilityProvider.initialize()
        ObservabilityProvider.patch_openai()
    
    @ObservabilityProvider.observe(name="llm_complete")
    async def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 2048,
    ) -> str:
        """Complete a prompt. Uses LlamaIndex LLM for consistency."""
        from llama_index.core.llms import ChatMessage
        
        llm = get_llm(temperature=temperature, max_tokens=max_tokens)
        
        messages = []
        if system_prompt:
            messages.append(ChatMessage(role="system", content=system_prompt))
        messages.append(ChatMessage(role="user", content=prompt))
        
        response = llm.chat(messages)
        ObservabilityProvider.flush()
        
        return str(response)
    
    @ObservabilityProvider.observe(name="llm_stream")
    async def stream_complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a completion. Uses LlamaIndex LLM for consistency."""
        from llama_index.core.llms import ChatMessage
        
        llm = get_llm()
        
        messages = []
        if system_prompt:
            messages.append(ChatMessage(role="system", content=system_prompt))
        messages.append(ChatMessage(role="user", content=prompt))
        
        response = llm.stream_chat(messages)
        for chunk in response:
            if chunk.delta:
                yield chunk.delta
        
        ObservabilityProvider.flush()
