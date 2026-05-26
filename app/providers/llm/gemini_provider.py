"""
Gemini LLM Provider — Optional cloud provider using Google Gemini API.

Supports:
- Chat completions via the Google Generative AI API
- Streaming responses
- Multi-modal (text + audio context)

Usage:
    provider = GeminiLLMProvider(api_key="...")
    response = await provider.complete([{"role": "user", "content": "Hello!"}])

Requires GEMINI_API_KEY environment variable.
"""

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.providers.base import LLMProvider

logger = logging.getLogger("voiceai.llm.gemini")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"


class GeminiLLMProvider(LLMProvider):
    """LLM provider using Google's Gemini API.

    This is an OPTIONAL provider — the system works fully without it.
    Useful as a cloud fallback when local models are unavailable.

    API Reference: https://ai.google.dev/api/generate-content
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-2.0-flash",
        default_temperature: float = 0.7,
        default_max_tokens: int = 1024,
        http_timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._model = model
        self._default_temperature = default_temperature
        self._default_max_tokens = default_max_tokens
        self._http_timeout = http_timeout
        self._client: httpx.AsyncClient | None = None

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_tool_calling(self) -> bool:
        # TODO: Implement Gemini tool/function calling
        # Gemini supports function calling via `tools` parameter
        return False

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

    def _convert_messages(self, messages: list[dict]) -> list[dict]:
        """Convert standard messages to Gemini format.

        Gemini uses 'contents' array with 'role' and 'parts'.
        """
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "system":
                # Gemini uses system_instruction parameter, not contents
                continue
            if role == "agent":
                role = "model"
            if role == "assistant":
                role = "model"

            contents.append({
                "role": role if role in ("user", "model") else "user",
                "parts": [{"text": msg.get("content", "")}],
            })
        return contents

    def _extract_system_instruction(self, messages: list[dict]) -> str | None:
        """Extract system message from messages list."""
        for msg in messages:
            if msg.get("role") == "system":
                return msg.get("content", "")
        return None

    async def complete(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> str:
        """Non-streaming completion using Gemini API."""
        if not self._api_key:
            raise ValueError(
                "Gemini API key is not configured. "
                "Set GEMINI_API_KEY environment variable."
            )

        client = await self._ensure_client()
        contents = self._convert_messages(messages)
        system_instruction = self._extract_system_instruction(messages)

        body: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "maxOutputTokens": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        logger.debug(
            "Gemini complete: model=%s, messages=%d",
            self._model,
            len(contents),
        )

        try:
            response = await client.post(
                f"{GEMINI_API_BASE}/models/{self._model}:generateContent",
                json=body,
                params={"key": self._api_key},
            )
        except httpx.ConnectError:
            raise ConnectionError(
                f"Cannot connect to Gemini API. Check your network and GEMINI_API_KEY."
            )

        if response.status_code == 403 or response.status_code == 401:
            raise ValueError(
                "Invalid Gemini API key. Check your GEMINI_API_KEY environment variable."
            )
        if response.status_code == 429:
            raise RuntimeError(
                "Gemini API rate limit exceeded. Try again later."
            )

        response.raise_for_status()
        data = response.json()

        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return text
        except (KeyError, IndexError) as e:
            logger.warning("Unexpected Gemini response: %s", data.get("error", str(e)))
            return ""

    async def complete_stream(
        self,
        messages: list[dict],
        temperature: float | None = None,
        max_tokens: int | None = None,
        **kwargs,
    ) -> AsyncIterator[str]:
        """Streaming completion using Gemini API.

        Yields content tokens as they are generated via SSE.
        """
        if not self._api_key:
            raise ValueError(
                "Gemini API key is not configured. "
                "Set GEMINI_API_KEY environment variable."
            )

        client = await self._ensure_client()
        contents = self._convert_messages(messages)
        system_instruction = self._extract_system_instruction(messages)

        body: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature if temperature is not None else self._default_temperature,
                "maxOutputTokens": max_tokens if max_tokens is not None else self._default_max_tokens,
            },
        }

        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        try:
            async with client.stream(
                "POST",
                f"{GEMINI_API_BASE}/models/{self._model}:streamGenerateContent",
                json=body,
                params={"key": self._api_key, "alt": "sse"},
            ) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        yield text
                        except json.JSONDecodeError:
                            continue

        except httpx.ConnectError:
            raise ConnectionError(
                f"Cannot connect to Gemini API. Check your network and GEMINI_API_KEY."
            )
