"""
Observability Provider — Langfuse
Thin wrapper around Langfuse for LLM tracing, monitoring, and evaluation.

Libraries: langfuse, openai
"""
import os
from typing import Any, Callable, Dict, Optional, TypeVar

from app.core.config import settings

F = TypeVar("F", bound=Callable[..., Any])


class ObservabilityProvider:
    """Thin wrapper around Langfuse for LLM observability."""
    
    _langfuse = None
    _initialized = False
    
    @classmethod
    def initialize(cls):
        """Initialize Langfuse client."""
        if cls._initialized:
            return
        
        cls._initialized = True
        
        if not settings.LANGFUSE_PUBLIC_KEY:
            print("Langfuse not configured — skipping observability setup.")
            return
        
        try:
            from langfuse import Langfuse
            cls._langfuse = Langfuse(
                public_key=settings.LANGFUSE_PUBLIC_KEY,
                secret_key=settings.LANGFUSE_SECRET_KEY,
                host=settings.LANGFUSE_HOST or "https://cloud.langfuse.com",
            )
            print("Langfuse initialized successfully.")
        except ImportError:
            print("Langfuse not installed — skipping observability.")
    
    @classmethod
    def get_client(cls):
        """Get the Langfuse client instance."""
        if not cls._initialized:
            cls.initialize()
        return cls._langfuse
    
    @classmethod
    def observe(cls, name: Optional[str] = None):
        """Decorator to trace a function with Langfuse."""
        def decorator(func: F) -> F:
            if cls._langfuse is None:
                return func
            
            try:
                from langfuse.decorators import observe
                if name:
                    return observe(name=name)(func)
                return observe()(func)
            except ImportError:
                return func
        
        return decorator
    
    @classmethod
    def trace(cls, name: str, **kwargs):
        """Create a manual trace."""
        client = cls.get_client()
        if client is None:
            return None
        return client.trace(name=name, **kwargs)
    
    @classmethod
    def flush(cls):
        """Flush all pending traces."""
        if cls._langfuse is not None:
            cls._langfuse.flush()
    
    @classmethod
    def patch_openai(cls):
        """Auto-patch OpenAI client for tracing."""
        if cls._langfuse is None:
            return
        
        try:
            from langfuse.openai import openai as patched_openai
            return patched_openai
        except ImportError:
            return None
