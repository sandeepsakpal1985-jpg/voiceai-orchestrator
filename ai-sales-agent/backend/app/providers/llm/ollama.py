"""
Ollama LLM Provider — Fully local inference via Ollama REST API.
Supports Qwen, Llama, Mistral, and other Ollama-compatible models.
"""

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger("ai_sales_agent.llm.ollama")


class OllamaLLMProvider(LLMProvider):
    """LLM provider using Ollama for fully local inference."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:7b", default_temperature: float = 0.7, default_max_tokens: int = 1024, http_timeout: float = 120.0):
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._default_temperature = default_temperature
        self._default_max_tokens = default_max_tokens
        self._http_timeout = http_timeout
        self._client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        return True

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._http_timeout, limits=httpx.Limits(max_keepalive_connections=5, max_connections=10))
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def complete(self, messages: list[dict], temperature: float | None = None, max_tokens: int | None = None, **kwargs) -> str:
        client = await self._ensure_client()
        ollama_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

        body = {
            "model": kwargs.get("model", self._model),
            "messages": ollama_messages,
            "stream": False,
            "options": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "num_predict": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        try:
            response = await client.post(f"{self._base_url}/api/chat", json=body)
        except httpx.ConnectError:
            raise ConnectionError(f"Cannot connect to Ollama server at {self._base_url}.")

        if response.status_code == 404:
            raise ValueError(f"Model '{self._model}' not found. Run: ollama pull {self._model}")

        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "")

    async def complete_stream(self, messages: list[dict], temperature: float | None = None, max_tokens: int | None = None, **kwargs) -> AsyncIterator[str]:
        client = await self._ensure_client()
        ollama_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

        body = {
            "model": kwargs.get("model", self._model),
            "messages": ollama_messages,
            "stream": True,
            "options": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "num_predict": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        async with client.stream("POST", f"{self._base_url}/api/chat", json=body) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
