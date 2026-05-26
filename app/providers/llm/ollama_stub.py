"""
Ollama LLM Provider — Stub for local self-hosted inference.

Future implementation will support:
- Fully local LLM inference via Ollama
- Qwen, Llama, Mistral models
- No external API dependencies
- GPU-accelerated inference
"""

from typing import AsyncIterator

from app.providers.base import LLMProvider


class OllamaLLMProvider(LLMProvider):
    """LLM provider using Ollama for local inference.

    NOTE: This is a stub for future self-hosting support.
    Implement when Ollama server is available.
    """

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:7b"):
        self._base_url = base_url
        self._model = model

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        return False  # Ollama doesn't natively support tool calling yet

    async def complete(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs,
    ) -> str:
        raise NotImplementedError(
            "Ollama LLM is not yet implemented. "
            "Set LLM_PROVIDER=openai to use OpenAI-compatible API."
        )

    async def complete_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs,
    ) -> AsyncIterator[str]:
        raise NotImplementedError(
            "Ollama streaming LLM is not yet implemented. "
            "Set LLM_PROVIDER=openai to use OpenAI-compatible API."
        )
