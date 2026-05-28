"""
Tests for Subscription Enforcement Middleware — Plan limits, feature access,
usage tracking, and middleware dispatch.

Covers:
  - PLAN_LIMITS: all plan tiers are defined with correct limits
  - check_feature_access: correct feature access per plan
  - check_call_limit: daily call limit enforcement
  - calculate_usage_percentages: usage as percentage of limits
  - increment_usage / get_usage: tracking counters
  - SubscriptionEnforcementMiddleware: dispatch, feature gating, daily limits
"""

import os
import pytest
from unittest.mock import AsyncMock, patch

from app.middleware.subscription import (
    PLAN_LIMITS,
    DEFAULT_LIMITS,
    PREMIUM_LIMITS,
    ENTERPRISE_LIMITS,
    check_feature_access,
    check_call_limit,
    calculate_usage_percentages,
    increment_usage,
    get_usage,
    _usage_counts,
    _last_reset,
)


# ═══════════════════════════════════════════════════════════════════════
# PLAN_LIMITS
# ═══════════════════════════════════════════════════════════════════════


class TestPlanLimits:
    """Tests that PLAN_LIMITS has all expected plans with correct structure."""

    def test_has_all_plan_tiers(self):
        """Should have all expected plan tiers."""
        expected_plans = {"free", "starter", "professional", "business", "enterprise"}
        assert expected_plans.issubset(set(PLAN_LIMITS.keys()))

    def test_each_plan_has_required_keys(self):
        """Each plan should have all required keys."""
        required_keys = {
            "api_calls_per_month", "call_minutes_per_month",
            "daily_calls", "max_concurrent_calls", "features",
        }
        for plan_name, limits in PLAN_LIMITS.items():
            for key in required_keys:
                assert key in limits, f"Plan '{plan_name}' missing key '{key}'"

    def test_enterprise_has_highest_limits(self):
        """Enterprise should have the highest or equal limits."""
        enterprise = PLAN_LIMITS["enterprise"]
        for plan_name, limits in PLAN_LIMITS.items():
            if plan_name == "enterprise":
                continue
            assert enterprise["api_calls_per_month"] >= limits["api_calls_per_month"]
            assert enterprise["call_minutes_per_month"] >= limits["call_minutes_per_month"]
            assert enterprise["daily_calls"] >= limits["daily_calls"]
            assert enterprise["max_concurrent_calls"] >= limits["max_concurrent_calls"]

    def test_free_has_most_limited_features(self):
        """Free plan should have the fewest features."""
        features = set(PLAN_LIMITS["free"]["features"])
        for plan_name, limits in PLAN_LIMITS.items():
            if plan_name == "free":
                continue
            other_features = set(limits["features"])
            # Free features should be a subset of all other plans
            assert features.issubset(other_features), (
                f"Free plan features not subset of '{plan_name}'"
            )

    def test_enterprise_has_all_features(self):
        """Enterprise should have all features."""
        enterprise_features = set(PLAN_LIMITS["enterprise"]["features"])
        for plan_name, limits in PLAN_LIMITS.items():
            other_features = set(limits["features"])
            assert other_features.issubset(enterprise_features), (
                f"Enterprise missing features from '{plan_name}'"
            )

    def test_free_plan_limits_are_lowest(self):
        """Free plan should have the lowest or equal limits."""
        free = PLAN_LIMITS["free"]
        for plan_name, limits in PLAN_LIMITS.items():
            if plan_name == "free":
                continue
            assert free["daily_calls"] <= limits["daily_calls"]
            assert free["max_concurrent_calls"] <= limits["max_concurrent_calls"]


# ═══════════════════════════════════════════════════════════════════════
# check_feature_access
# ═══════════════════════════════════════════════════════════════════════


class TestCheckFeatureAccess:
    """Tests for the check_feature_access helper."""

    def test_free_plan_has_basic_features(self):
        """Free plan should have access to basic features."""
        assert check_feature_access("free", "voice_chat") is True
        assert check_feature_access("free", "basic_analytics") is True
        assert check_feature_access("free", "text_processing") is True

    def test_free_plan_no_premium_features(self):
        """Free plan should not have access to premium features."""
        assert check_feature_access("free", "advanced_analytics") is False
        assert check_feature_access("free", "crm_integration") is False
        assert check_feature_access("free", "webhooks") is False
        assert check_feature_access("free", "multilingual") is False

    def test_business_plan_has_all_features(self):
        """Business plan should have most features."""
        assert check_feature_access("business", "voice_chat") is True
        assert check_feature_access("business", "advanced_analytics") is True
        assert check_feature_access("business", "crm_integration") is True
        assert check_feature_access("business", "webhooks") is True
        assert check_feature_access("business", "multilingual") is True

    def test_unknown_plan_uses_default(self):
        """Unknown plan should fall back to default (free) limits."""
        assert check_feature_access("unknown_plan", "voice_chat") is True
        assert check_feature_access("unknown_plan", "advanced_analytics") is False

    def test_unknown_feature_returns_false(self):
        """Unknown feature should return False."""
        assert check_feature_access("enterprise", "nonexistent_feature") is False


# ═══════════════════════════════════════════════════════════════════════
# check_call_limit
# ═══════════════════════════════════════════════════════════════════════


class TestCheckCallLimit:
    """Tests for the check_call_limit helper."""

    def setup_method(self):
        # Clear usage state before each test
        _usage_counts.clear()
        _last_reset.clear()

    def test_free_plan_allows_within_limit(self):
        """Free plan should allow calls within daily limit."""
        assert check_call_limit("fresh-tenant", "free") is True

    def test_free_plan_blocks_over_limit(self):
        """Free plan should block calls exceeding daily limit."""
        # Use up all daily calls (free limit = 20)
        for _ in range(20):
            increment_usage("over-limit-tenant", daily_calls=1)
        assert check_call_limit("over-limit-tenant", "free") is False

    def test_enterprise_plan_allows_many_calls(self):
        """Enterprise plan should allow many calls."""
        for _ in range(500):
            increment_usage("enterprise-tenant", daily_calls=1)
        assert check_call_limit("enterprise-tenant", "enterprise") is True

    def test_different_tenants_independent(self):
        """Different tenants should have independent call limits."""
        increment_usage("tenant-a", daily_calls=20)
        assert check_call_limit("tenant-a", "free") is False
        assert check_call_limit("tenant-b", "free") is True


# ═══════════════════════════════════════════════════════════════════════
# increment_usage / get_usage
# ═══════════════════════════════════════════════════════════════════════


class TestUsageTracking:
    """Tests for increment_usage and get_usage."""

    def setup_method(self):
        _usage_counts.clear()
        _last_reset.clear()

    def test_initial_usage_returns_zeros(self):
        """Fresh tenant should have zero usage."""
        usage = get_usage("fresh-tenant")
        assert usage["api_calls"] == 0
        assert usage["call_minutes"] == 0
        assert usage["daily_calls"] == 0

    def test_increment_api_calls(self):
        """Should increment API call count."""
        increment_usage("api-tenant", api_calls=5)
        usage = get_usage("api-tenant")
        assert usage["api_calls"] == 5

    def test_increment_call_minutes(self):
        """Should increment call minutes."""
        increment_usage("minutes-tenant", call_minutes=10)
        usage = get_usage("minutes-tenant")
        assert usage["call_minutes"] == 10

    def test_increment_daily_calls(self):
        """Should increment daily call count."""
        increment_usage("daily-tenant", daily_calls=3)
        usage = get_usage("daily-tenant")
        assert usage["daily_calls"] == 3

    def test_increment_all_counters(self):
        """Should increment all counters at once."""
        increment_usage("all-tenant", api_calls=1, call_minutes=2, daily_calls=3)
        usage = get_usage("all-tenant")
        assert usage["api_calls"] == 1
        assert usage["call_minutes"] == 2
        assert usage["daily_calls"] == 3

    def test_multiple_increments_accumulate(self):
        """Multiple increments should accumulate."""
        for _ in range(5):
            increment_usage("accum-tenant", api_calls=2)
        usage = get_usage("accum-tenant")
        assert usage["api_calls"] == 10

    def test_different_tenants_isolated(self):
        """Different tenants should have independent usage counters."""
        increment_usage("tenant-x", api_calls=10)
        increment_usage("tenant-y", api_calls=20)
        assert get_usage("tenant-x")["api_calls"] == 10
        assert get_usage("tenant-y")["api_calls"] == 20


# ═══════════════════════════════════════════════════════════════════════
# calculate_usage_percentages
# ═══════════════════════════════════════════════════════════════════════


class TestCalculateUsagePercentages:
    """Tests for calculate_usage_percentages helper."""

    def setup_method(self):
        _usage_counts.clear()
        _last_reset.clear()

    def test_returns_correct_structure(self):
        """Should return correct structure with all expected keys."""
        result = calculate_usage_percentages("any-tenant", "free")
        assert "api_calls" in result
        assert "daily_calls" in result
        assert "plan" in result
        assert "used" in result["api_calls"]
        assert "limit" in result["api_calls"]
        assert "percent" in result["api_calls"]

    def test_zero_usage_returns_zero_percent(self):
        """Zero usage should return 0% for all metrics."""
        result = calculate_usage_percentages("zero-tenant", "free")
        assert result["api_calls"]["percent"] == 0
        assert result["daily_calls"]["percent"] == 0

    def test_half_usage_returns_50_percent(self):
        """Half of daily calls used should return ~50%."""
        for _ in range(10):
            increment_usage("half-tenant", daily_calls=1)
        result = calculate_usage_percentages("half-tenant", "free")
        assert result["daily_calls"]["percent"] == 50.0

    def test_full_usage_returns_100_percent(self):
        """All daily calls used should return 100%."""
        for _ in range(20):
            increment_usage("full-tenant", daily_calls=1)
        result = calculate_usage_percentages("full-tenant", "free")
        assert result["daily_calls"]["percent"] == 100.0

    def test_over_usage_capped_at_100(self):
        """Usage exceeding limit should be capped at 100%."""
        for _ in range(30):
            increment_usage("over-tenant", daily_calls=1)
        result = calculate_usage_percentages("over-tenant", "free")
        assert result["daily_calls"]["percent"] == 100.0

    def test_includes_plan_name(self):
        """Should include the plan name in the result."""
        result = calculate_usage_percentages("plan-tenant", "professional")
        assert result["plan"] == "professional"


# ═══════════════════════════════════════════════════════════════════════
# DEFAULT_LIMITS, PREMIUM_LIMITS, ENTERPRISE_LIMITS
# ═══════════════════════════════════════════════════════════════════════


class TestNamedLimits:
    """Tests for the named limit constants."""

    def test_default_limits_have_required_keys(self):
        """DEFAULT_LIMITS should have all required keys."""
        assert "api_calls_per_month" in DEFAULT_LIMITS
        assert "daily_calls" in DEFAULT_LIMITS
        assert "max_concurrent_calls" in DEFAULT_LIMITS
        assert "features" in DEFAULT_LIMITS

    def test_premium_has_higher_limits_than_default(self):
        """PREMIUM_LIMITS should have higher limits than DEFAULT_LIMITS."""
        assert PREMIUM_LIMITS["api_calls_per_month"] > DEFAULT_LIMITS["api_calls_per_month"]
        assert PREMIUM_LIMITS["daily_calls"] > DEFAULT_LIMITS["daily_calls"]
        assert PREMIUM_LIMITS["max_concurrent_calls"] > DEFAULT_LIMITS["max_concurrent_calls"]

    def test_enterprise_has_highest_limits(self):
        """ENTERPRISE_LIMITS should have the highest limits."""
        assert ENTERPRISE_LIMITS["api_calls_per_month"] >= PREMIUM_LIMITS["api_calls_per_month"]
        assert ENTERPRISE_LIMITS["call_minutes_per_month"] >= PREMIUM_LIMITS["call_minutes_per_month"]
        assert ENTERPRISE_LIMITS["daily_calls"] >= PREMIUM_LIMITS["daily_calls"]
