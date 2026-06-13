"""
Gemini LLM Provider — Google's Gemini models via API.
"""

import logging
from typing import AsyncIterator

from app.providers.base import LLMProvider

logger = logging.getLogger("ai_sales_agent.llm.gemini")


class GeminiLLMProvider(LLMProvider):
    """LLM provider using Google's Gemini API."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self._api_key = api_key
        self._model = model

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        return True

    async def complete(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024, **kwargs) -> str:
        try:
            import google.genai as genai
            client = genai.Client(api_key=self._api_key)
            response = client.models.generate_content(model=self._model, contents=messages[-1]["content"] if messages else "")
            return response.text or ""
        except ImportError:
            logger.warning("google-genai package not installed")
            return ""

    async def complete_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024, **kwargs) -> AsyncIterator[str]:
        text = await self.complete(messages, temperature=temperature, max_tokens=max_tokens, **kwargs)
        yield text
