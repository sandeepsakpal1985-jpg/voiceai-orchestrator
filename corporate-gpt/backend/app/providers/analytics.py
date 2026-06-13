"""
Analytics Provider — PostHog
Thin wrapper around PostHog for product analytics, event tracking, and insights.

Libraries: posthog
"""
import os
from typing import Any, Dict, Optional

from app.core.config import settings


class AnalyticsProvider:
    """Thin wrapper around PostHog for product analytics."""
    
    _posthog = None
    _initialized = False
    
    @classmethod
    def initialize(cls):
        """Initialize PostHog client."""
        if cls._initialized:
            return
        
        cls._initialized = True
        
        if not settings.POSTHOG_API_KEY:
            print("PostHog not configured — skipping analytics.")
            return
        
        try:
            import posthog
            posthog.api_key = settings.POSTHOG_API_KEY
            posthog.host = settings.POSTHOG_HOST or "https://app.posthog.com"
            cls._posthog = posthog
            print("PostHog initialized successfully.")
        except ImportError:
            print("PostHog not installed — skipping analytics.")
    
    @classmethod
    def capture(
        cls,
        distinct_id: str,
        event: str,
        properties: Optional[Dict[str, Any]] = None,
    ):
        """Capture a PostHog event."""
        if not cls._initialized:
            cls.initialize()
        
        if cls._posthog is None:
            return
        
        try:
            cls._posthog.capture(
                distinct_id=distinct_id,
                event=event,
                properties=properties or {},
            )
        except Exception as e:
            print(f"PostHog capture failed: {e}")
    
    @classmethod
    def identify(
        cls,
        distinct_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ):
        """Identify a user in PostHog."""
        if not cls._initialized:
            cls.initialize()
        
        if cls._posthog is None:
            return
        
        try:
            cls._posthog.identify(
                distinct_id=distinct_id,
                properties=properties or {},
            )
        except Exception as e:
            print(f"PostHog identify failed: {e}")
    
    @classmethod
    def shutdown(cls):
        """Flush and shutdown PostHog."""
        if cls._posthog is not None:
            cls._posthog.shutdown()
