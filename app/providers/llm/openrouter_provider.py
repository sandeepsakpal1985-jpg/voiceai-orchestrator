"""
OpenRouter LLM Provider — Optional cloud provider for multi-model access.

Supports:
- Access to 100+ models via a single API
- Streaming responses
- Tool/Function calling
- Latest models from Qwen, Anthropic, Google, Meta, etc.

Usage:
    provider = OpenRouterLLMProvider(api_key="...")
    response = await provider.complete([{"role": "user", "content": "Hello!"}])

Requires OPENROUTER_API_KEY environment variable.
"""

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger("voiceai.llm.openrouter")


class OpenRouterLLMProvider(LLMProvider):
    """LLM provider using OpenRouter API for multi-model access.

    This is an OPTIONAL provider — the system works fully without it.
    Useful for accessing larger models (e.g., Qwen-2.5-72B, Claude)
    without running them locally.

    API Reference: https://openrouter.ai/docs/api-reference
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://openrouter.ai/api/v1",
        model: str = "qwen/qwen-2.5-72b-instruct",
        default_temperature: float = 0.7,
        default_max_tokens: int = 2048,
        http_timeout: float = 60.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._default_temperature = default_temperature
        self._default_max_tokens = default_max_tokens
        self._http_timeout = http_timeout
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
            self._client = httpx.AsyncClient(
                timeout=self._http_timeout,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _post(self, body: dict) -> httpx.Response:
        """Make an HTTP POST to the chat completions endpoint."""
        if not self._api_key:
            raise ValueError(
                "OpenRouter API key is not configured. "
                "Set OPENROUTER_API_KEY environment variable."
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": "https://github.com/voiceai/orchestrator",
            "X-Title": "VoiceAI Orchestrator",
        }

        client = await self._ensure_client()
        response = await client.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers=headers,
        )

        if response.status_code == 401:
            raise ValueError(
                "Invalid OpenRouter API key. Check your OPENROUTER_API_KEY."
            )
        if response.status_code == 402:
            raise RuntimeError(
                "OpenRouter: Insufficient credits or free tier limit reached."
            )
        if response.status_code == 429:
            raise RuntimeError(
                "OpenRouter rate limit exceeded. Try again later."
            )

        response.raise_for_status()
        return response

    async def complete(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> str:
        """Non-streaming chat completion via OpenRouter.

        Returns the full response text, or JSON with tool_calls if tools were used.
        """
        body = {
            "model": kwargs.get("model", self._model),
            "messages": messages,
            "temperature": temperature if temperature is not None else self._default_temperature,
            "max_tokens": max_tokens if max_tokens is not None else self._default_max_tokens,
            "stream": False,
        }

        # Add tools if provided
        tools = kwargs.get("tools")
        if tools:
            body["tools"] = tools

        response = await self._post(body)
        data = response.json()

        choice = data["choices"][0]
        message = choice["message"]

        # Handle tool calls if present
        if message.get("tool_calls"):
            return json.dumps({
                "content": message.get("content", ""),
                "tool_calls": [
                    {
                        "id": tc["id"],
                        "type": tc["type"],
                        "function": tc["function"],
                    }
                    for tc in message["tool_calls"]
                ],
            })

        return message.get("content", "")

    async def complete_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming chat completion via OpenRouter.

        Yields content delta chunks as they arrive.
        """
        body = {
            "model": kwargs.get("model", self._model),
            "messages": messages,
            "temperature": temperature if temperature is not None else self._default_temperature,
            "max_tokens": max_tokens if max_tokens is not None else self._default_max_tokens,
            "stream": True,
            "stream_options": {"include_usage": False},
        }

        response = await self._post(body)

        async for line in response.aiter_lines():
            line = line.strip()
            if not line or not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break

            try:
                chunk = json.loads(data)
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content")
                if content:
                    yield content
            except json.JSONDecodeError:
                continue

    async def list_models(self) -> list[dict]:
        """List available models from OpenRouter."""
        client = await self._ensure_client()
        try:
            response = await client.get(f"{self._base_url}/models")
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])
        except Exception as e:
            logger.warning("Failed to list OpenRouter models: %s", e)
            return []
