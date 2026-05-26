"""
Ollama LLM Provider — Real implementation using Ollama REST API.

Supports:
- Fully local LLM inference via Ollama
- Qwen, Llama, Mistral, and other Ollama-compatible models
- Streaming responses via SSE
- No external API dependencies
- GPU-accelerated inference when available

API Reference: https://github.com/ollama/ollama/blob/main/docs/api.md
"""

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger("voiceai.llm.ollama")


class OllamaLLMProvider(LLMProvider):
    """LLM provider using Ollama for fully local inference.

    Connects to a running Ollama server (default: http://localhost:11434).
    Supports any model available in the Ollama library.

    Usage:
        provider = OllamaLLMProvider(model="qwen2.5:7b")
        response = await provider.complete([{"role": "user", "content": "Hello!"}])

    Requires Ollama server to be running. See https://ollama.ai for setup.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "qwen2.5:7b",
        default_temperature: float = 0.7,
        default_max_tokens: int = 1024,
        http_timeout: float = 120.0,  # LLMs can be slow
    ):
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
        # Ollama supports tools in recent versions (0.5.0+)
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

    async def _check_server(self) -> bool:
        """Check if the Ollama server is running."""
        try:
            client = await self._ensure_client()
            response = await client.get(f"{self._base_url}/")
            return response.status_code == 200
        except Exception:
            return False

    async def _convert_messages(self, messages: list[dict]) -> list[dict]:
        """Convert messages to Ollama format.

        Ollama uses the same OpenAI-compatible message format,
        but we ensure 'assistant' role is used (not 'agent').
        """
        converted = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "agent":
                role = "assistant"
            converted.append({"role": role, "content": msg.get("content", "")})
        return converted

    async def complete(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> str:
        """Non-streaming completion using Ollama API.

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature (0.0 - 1.0)
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text response
        """
        client = await self._ensure_client()
        ollama_messages = await self._convert_messages(messages)

        body = {
            "model": kwargs.get("model", self._model),
            "messages": ollama_messages,
            "stream": False,
            "options": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "num_predict": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        # Add tools if provided
        tools = kwargs.get("tools")
        if tools:
            body["tools"] = tools

        logger.debug(
            "Ollama complete: model=%s, messages=%d, temperature=%.2f",
            body["model"],
            len(ollama_messages),
            body["options"]["temperature"],
        )

        try:
            response = await client.post(
                f"{self._base_url}/api/chat",
                json=body,
            )
        except httpx.ConnectError:
            raise ConnectionError(
                f"Cannot connect to Ollama server at {self._base_url}. "
                f"Make sure Ollama is running (ollama serve). "
                f"Model '{self._model}' must be pulled (ollama pull {self._model})."
            )

        if response.status_code == 404:
            raise ValueError(
                f"Model '{self._model}' not found in Ollama. "
                f"Run: ollama pull {self._model}"
            )

        response.raise_for_status()
        data = response.json()

        content = data.get("message", {}).get("content", "")
        return content

    async def complete_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming completion using Ollama API.

        Yields content tokens as they are generated.
        """
        client = await self._ensure_client()
        ollama_messages = await self._convert_messages(messages)

        body = {
            "model": kwargs.get("model", self._model),
            "messages": ollama_messages,
            "stream": True,
            "options": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "num_predict": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        logger.debug(
            "Ollama streaming: model=%s, messages=%d",
            body["model"],
            len(ollama_messages),
        )

        try:
            async with client.stream(
                "POST",
                f"{self._base_url}/api/chat",
                json=body,
            ) as response:
                if response.status_code == 404:
                    raise ValueError(
                        f"Model '{self._model}' not found. Run: ollama pull {self._model}"
                    )
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

        except httpx.ConnectError:
            raise ConnectionError(
                f"Cannot connect to Ollama server at {self._base_url}. "
                f"Run 'ollama serve' and 'ollama pull {self._model}' first."
            )

    # ── Utility methods ───────────────────────────────────────────

    async def list_models(self) -> list[dict]:
        """List available models in the Ollama server."""
        client = await self._ensure_client()
        try:
            response = await client.get(f"{self._base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            return data.get("models", [])
        except Exception as e:
            logger.warning("Failed to list Ollama models: %s", e)
            return []

    async def pull_model(self, model: str | None = None) -> AsyncIterator[dict]:
        """Pull a model from the Ollama registry.

        Yields progress updates as the model is downloaded.
        """
        target_model = model or self._model
        client = await self._ensure_client()

        async with client.stream(
            "POST",
            f"{self._base_url}/api/pull",
            json={"name": target_model, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.strip():
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue

    async def generate_embeddings(self, text: str, model: str | None = None) -> list[float]:
        """Generate embeddings using Ollama's embedding API.

        Args:
            text: Input text to embed
            model: Embedding model name (defaults to the configured model)

        Returns:
            Embedding vector as list of floats
        """
        client = await self._ensure_client()
        body = {
            "model": model or self._model,
            "prompt": text,
        }

        response = await client.post(
            f"{self._base_url}/api/embeddings",
            json=body,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("embedding", [])
