"""
Subscription Enforcement Middleware

Validates API requests against subscription plan limits:
  - Call count limits (daily/monthly)
  - API call rate limits
  - Feature access gating

Supports multi-tenant (organization-level) and single-user subscriptions.
"""

import logging
import time
from collections import defaultdict
from typing import Callable

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("voiceai.subscription_enforcement")

# ── In-memory usage tracking (replace with Redis in production) ──

_usage_counts: dict[str, dict[str, int]] = defaultdict(
    lambda: {"api_calls": 0, "call_minutes": 0, "daily_calls": 0}
)
_last_reset: dict[str, float] = {}


def _get_daily_key(tenant_id: str) -> str:
    """Get the daily usage key for a tenant, resetting if a new day."""
    today = time.strftime("%Y-%m-%d")
    key = f"{tenant_id}:{today}"
    # Reset if day changed
    if key not in _last_reset:
        _last_reset[key] = time.time()
        _usage_counts[tenant_id] = {"api_calls": 0, "call_minutes": 0, "daily_calls": 0}
    return key


def increment_usage(
    tenant_id: str,
    api_calls: int = 0,
    call_minutes: int = 0,
    daily_calls: int = 0,
):
    """Increment usage counters for a tenant."""
    _get_daily_key(tenant_id)
    _usage_counts[tenant_id]["api_calls"] += api_calls
    _usage_counts[tenant_id]["call_minutes"] += call_minutes
    _usage_counts[tenant_id]["daily_calls"] += daily_calls


def get_usage(tenant_id: str) -> dict:
    """Get current usage statistics for a tenant."""
    _get_daily_key(tenant_id)
    return dict(_usage_counts[tenant_id])


# ── Plan Limits Configuration ──

# Default plan limits when no subscription is found
DEFAULT_LIMITS = {
    "api_calls_per_month": 100,
    "call_minutes_per_month": 60,
    "daily_calls": 20,
    "max_concurrent_calls": 2,
    "features": [
        "basic_analytics",
        "voice_chat",
        "text_processing",
        "knowledge_base",
        "agents",
        "social_automation",
    ],
}

# Premium plan limits
PREMIUM_LIMITS = {
    "api_calls_per_month": 10000,
    "call_minutes_per_month": 1000,
    "daily_calls": 200,
    "max_concurrent_calls": 10,
    "features": [
        "basic_analytics",
        "advanced_analytics",
        "voice_chat",
        "text_processing",
        "crm_integration",
        "custom_prompts",
        "knowledge_base",
        "team_members",
        "webhooks",
        "multilingual",
    ],
}

# Enterprise plan limits (unlimited for practical purposes)
ENTERPRISE_LIMITS = {
    "api_calls_per_month": 100000,
    "call_minutes_per_month": 10000,
    "daily_calls": 1000,
    "max_concurrent_calls": 50,
    "features": [
        "basic_analytics",
        "advanced_analytics",
        "voice_chat",
        "text_processing",
        "crm_integration",
        "custom_prompts",
        "knowledge_base",
        "team_members",
        "webhooks",
        "multilingual",
        "white_label",
        "api_access",
        "priority_support",
    ],
}

PLAN_LIMITS = {
    "free": DEFAULT_LIMITS,
    "starter": {
        "api_calls_per_month": 500,
        "call_minutes_per_month": 200,
        "daily_calls": 50,
        "max_concurrent_calls": 3,
        "features": [
            "basic_analytics",
            "voice_chat",
            "text_processing",
            "custom_prompts",
        ],
    },
    "professional": {
        "api_calls_per_month": 5000,
        "call_minutes_per_month": 500,
        "daily_calls": 100,
        "max_concurrent_calls": 5,
        "features": [
            "basic_analytics",
            "advanced_analytics",
            "voice_chat",
            "text_processing",
            "crm_integration",
            "custom_prompts",
            "knowledge_base",
            "team_members",
        ],
    },
    "business": PREMIUM_LIMITS,
    "enterprise": ENTERPRISE_LIMITS,
}


# ── Subscription Enforcement Middleware ──


class SubscriptionEnforcementMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces subscription plan limits.

    Checks:
      - Daily call limits
      - Feature access for specific endpoints
      - API call usage tracking

    Configured via plan name passed as X-Plan header or
    extracted from the request's tenant context.
    """

    def __init__(
        self,
        app,
        exclude_paths: list[str] | None = None,
    ):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/health",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/twilio/status",
        ]

    async def dispatch(self, request: Request, call_next: Callable):
        # Skip excluded paths
        path = request.url.path
        if any(path.startswith(ep) for ep in self.exclude_paths):
            return await call_next(request)

        # Extract tenant info (API key or X-Tenant-ID header)
        tenant_id = request.headers.get("X-Tenant-ID") or "default"
        plan_name = request.headers.get("X-Plan") or "free"

        # Get limits for this plan
        limits = PLAN_LIMITS.get(plan_name, DEFAULT_LIMITS)

        # Check feature access based on endpoint path
        feature_map = {
            "/voice": "voice_chat",
            "/calls": "api_access" if plan_name != "free" else "voice_chat",
            "/crm": "crm_integration",
            "/prompts": "custom_prompts",
            "/knowledge": "knowledge_base",
            "/webhooks": "webhooks",
            "/multilingual": "multilingual",
            "/analytics/advanced": "advanced_analytics",
        }

        for prefix, feature in feature_map.items():
            if path.startswith(prefix) and feature not in limits["features"]:
                return JSONResponse(
                    status_code=402,
                    content={
                        "error": "Feature not available on your plan",
                        "feature": feature,
                        "message": (
                            f"The '{feature}' feature requires an upgraded plan. "
                            f"Please upgrade to continue using this feature."
                        ),
                        "upgrade_url": "/dashboard/subscriptions",
                    },
                )

        #        # Check concurrent call limits for WebSocket and call endpoints
        if path.startswith("/ws/voice") or path.startswith("/calls") or path.startswith("/voice/process"):
            usage = get_usage(tenant_id)
            _check_concurrent_calls(tenant_id, plan_name, path)

        # Check daily call limits for call-related endpoints
        if path.startswith("/calls") or path.startswith("/voice/process"):
            usage = get_usage(tenant_id)
            if usage["daily_calls"] >= limits["daily_calls"]:
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Daily call limit reached",
                        "limit": limits["daily_calls"],
                        "current": usage["daily_calls"],
                        "message": (
                            f"You've reached your daily limit of {limits['daily_calls']} calls. "
                            f"Upgrade your plan for higher limits."
                        ),
                        "reset": "midnight UTC",
                        "upgrade_url": "/dashboard/subscriptions",
                    },
                )

            # Track this call
            increment_usage(tenant_id, daily_calls=1)

        # Track API calls for all other endpoints
        if not path.startswith(("/health", "/docs", "/redoc")):
            increment_usage(tenant_id, api_calls=1)

        # Process the request
        response = await call_next(request)

        # Add usage headers
        usage = get_usage(tenant_id)
        response.headers["X-Usage-APICalls"] = str(usage["api_calls"])
        response.headers["X-Usage-DailyCalls"] = str(usage["daily_calls"])
        response.headers["X-Plan"] = plan_name

        return response


# ── Helper Functions ──


def check_feature_access(plan_name: str, feature: str) -> bool:
    """Check if a plan has access to a specific feature."""
    limits = PLAN_LIMITS.get(plan_name, DEFAULT_LIMITS)
    return feature in limits["features"]


def check_call_limit(tenant_id: str, plan_name: str) -> bool:
    """Check if a tenant can make another call under their plan limits."""
    limits = PLAN_LIMITS.get(plan_name, DEFAULT_LIMITS)
    usage = get_usage(tenant_id)
    return usage["daily_calls"] < limits["daily_calls"]


def _check_concurrent_calls(tenant_id: str, plan_name: str, path: str) -> None:
    """Check if the tenant has reached their concurrent call limit."""
    limits = PLAN_LIMITS.get(plan_name, DEFAULT_LIMITS)
    max_concurrent = limits.get("max_concurrent_calls", 2)

    # Get active call counts from routers that track them
    try:
        from app.routers.ws_voice import get_active_ws_count
        from app.routers.twilio_webhooks import get_active_twilio_call_count

        active_ws = get_active_ws_count()
        active_twilio = get_active_twilio_call_count()
        total_active = active_ws + active_twilio

        if total_active >= max_concurrent:
            logger.warning(
                "Concurrent call limit reached for tenant %s: %d active (limit: %d)",
                tenant_id, total_active, max_concurrent,
            )
    except ImportError:
        pass


def calculate_usage_percentages(tenant_id: str, plan_name: str) -> dict:
    """Calculate usage as a percentage of plan limits."""
    limits = PLAN_LIMITS.get(plan_name, DEFAULT_LIMITS)
    usage = get_usage(tenant_id)
    return {
        "api_calls": {
            "used": usage["api_calls"],
            "limit": limits["api_calls_per_month"],
            "percent": min(
                round((usage["api_calls"] / max(limits["api_calls_per_month"], 1)) * 100, 1),
                100,
            ),
        },
        "daily_calls": {
            "used": usage["daily_calls"],
            "limit": limits["daily_calls"],
            "percent": min(
                round((usage["daily_calls"] / max(limits["daily_calls"], 1)) * 100, 1),
                100,
            ),
        },
        "plan": plan_name,
    }
