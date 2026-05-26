"""
OpenAI LLM Provider — Compatible with OpenAI API, Azure OpenAI, and local proxies.

Supports:
- Chat completions
- Streaming responses
- Tool/Function calling
"""

import json
from typing import Any, AsyncIterator

import httpx

from app.providers.base import LLMProvider


class OpenAILLMProvider(LLMProvider):
    """LLM provider using OpenAI-compatible API.

    Works with:
    - OpenAI API (api.openai.com)
    - Azure OpenAI
    - Local proxies (vLLM, Ollama with OpenAI compat, etc.)

    Uses a shared httpx client for connection reuse across requests.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        default_temperature: float = 0.7,
        default_max_tokens: int = 1024,
        http_timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._default_temperature = default_temperature
        self._default_max_tokens = default_max_tokens
        self._http_timeout = http_timeout
        # Shared client for connection reuse
        self._client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        return True

    async def _ensure_client(self) -> httpx.AsyncClient:
        """Get or create the shared HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._http_timeout,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )
        return self._client

    async def close(self) -> None:
        """Close the shared HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _post(self, body: dict) -> httpx.Response:
        """Make an HTTP POST to the chat completions endpoint."""
        if not self._api_key:
            raise ValueError(
                "OpenAI API key is not configured. "
                "Set OPENAI_API_KEY environment variable or pass api_key to the constructor."
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        client = await self._ensure_client()
        response = await client.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers=headers,
        )

        if response.status_code == 401:
            raise ValueError(
                "Invalid OpenAI API key. Check your OPENAI_API_KEY environment variable."
            )
        if response.status_code == 429:
            raise RuntimeError(
                "OpenAI rate limit exceeded. Consider reducing request frequency or upgrading your plan."
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
        """Non-streaming chat completion."""
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

        # Add tool_choice if provided
        tool_choice = kwargs.get("tool_choice")
        if tool_choice:
            body["tool_choice"] = tool_choice

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
        """Streaming chat completion. Yields content delta chunks."""
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
            data = line[6:]  # Remove "data: " prefix
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
