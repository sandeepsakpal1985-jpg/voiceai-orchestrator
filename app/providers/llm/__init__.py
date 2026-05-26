from .ollama_real import OllamaLLMProvider
from .openai import OpenAILLMProvider
from .gemini_provider import GeminiLLMProvider
from .openrouter_provider import OpenRouterLLMProvider

__all__ = [
    "OllamaLLMProvider",  # Local-first default
    "OpenAILLMProvider",  # Optional cloud fallback
    "GeminiLLMProvider",  # Optional cloud fallback
    "OpenRouterLLMProvider",  # Optional cloud multi-model
]
