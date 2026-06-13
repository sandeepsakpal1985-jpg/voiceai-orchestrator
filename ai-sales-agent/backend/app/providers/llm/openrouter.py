"""
OpenRouter LLM Provider — Multi-model access via OpenRouter API.
"""

import json
import logging
from typing import AsyncIterator

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger("ai_sales_agent.llm.openrouter")


class OpenRouterLLMProvider(LLMProvider):
    """LLM provider using OpenRouter for multi-model access."""

    def __init__(self, api_key: str, base_url: str = "https://openrouter.ai/api/v1", model: str = "qwen/qwen-2.5-72b-instruct"):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "openrouter"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        return True

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    async def complete(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024, **kwargs) -> str:
        client = await self._ensure_client()
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        body = {"model": self._model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
        response = await client.post(f"{self._base_url}/chat/completions", json=body, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"].get("content", "")

    async def complete_stream(self, messages: list[dict], temperature: float = 0.7, max_tokens: int = 1024, **kwargs) -> AsyncIterator[str]:
        client = await self._ensure_client()
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        body = {"model": self._model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens, "stream": True}
        async with client.stream("POST", f"{self._base_url}/chat/completions", json=body, headers=headers) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip() or not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue
