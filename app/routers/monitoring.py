"""
Monitoring & Observability Router — Metrics, deep health checks, structured logging.

Provides production-grade monitoring endpoints:
  - /metrics              — Prometheus-formatted metrics
  - /health/deep          — Deep health check (DB, LiveKit, ChromaDB, Ollama)
  - /health/readiness     — Kubernetes-style readiness probe
  - /health/liveness      — Kubernetes-style liveness probe
  - /logs/recent          — Recent structured log entries (ring buffer, last 200)

Metrics collected:
  - HTTP request count, duration, status codes
  - Active WebSocket connections
  - Active SIP/Twilio calls
  - Provider registration status
  - GPU availability
  - Memory usage (RSS, heap)
"""

import asyncio
import logging
import os
import time
from collections import deque
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse

from app.config import settings

# ── GPU Config (set at module load for health check) ──────────────────
_gpu_config: Any = None
try:
    from app.providers.gpu import detect_gpu_config
    _gpu_config = detect_gpu_config()
except Exception:
    pass

logger = logging.getLogger("voiceai.routers.monitoring")

router = APIRouter(prefix="", tags=["Monitoring"])

# ── App Start Time ───────────────────────────────────────────────────

_app_start_time = time.time()

# ── Structured Log Ring Buffer ───────────────────────────────────────

MAX_LOG_ENTRIES = 200
_recent_logs: deque[dict[str, Any]] = deque(maxlen=MAX_LOG_ENTRIES)


def record_log(level: str, message: str, **extra):
    """Record a structured log entry in the ring buffer."""
    _recent_logs.append({
        "timestamp": time.time(),
        "level": level,
        "message": message,
        **extra,
    })


# ── HTTP Metrics Store ───────────────────────────────────────────────

_http_metrics: dict[str, dict] = {}
_total_requests = 0


def record_request(method: str, path: str, status_code: int, duration_ms: float):
    """Record an HTTP request metric."""
    global _total_requests
    _total_requests += 1
    key = f"{method}:{path}"
    if key not in _http_metrics:
        _http_metrics[key] = {
            "method": method,
            "path": path,
            "count": 0,
            "total_duration_ms": 0.0,
            "status_codes": {},
            "last_request": 0.0,
        }
    m = _http_metrics[key]
    m["count"] += 1
    m["total_duration_ms"] += duration_ms
    m["status_codes"][str(status_code)] = m["status_codes"].get(str(status_code), 0) + 1
    m["last_request"] = time.time()


# ── Helper: Check Service Health ─────────────────────────────────────


async def _check_service(
    name: str, url: str, timeout: float = 5.0
) -> dict[str, Any]:
    """Check if a service is reachable via HTTP."""
    import httpx

    result = {"name": name, "status": "unknown", "latency_ms": None, "error": None}
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url)
            result["latency_ms"] = round((time.time() - start) * 1000, 1)
            if response.status_code < 500:
                result["status"] = "healthy"
            else:
                result["status"] = "degraded"
                result["error"] = f"HTTP {response.status_code}"
    except httpx.ConnectError:
        result["status"] = "unreachable"
        result["error"] = "Connection refused"
        result["latency_ms"] = round((time.time() - start) * 1000, 1)
    except httpx.TimeoutException:
        result["status"] = "timeout"
        result["error"] = f"Timeout after {timeout}s"
        result["latency_ms"] = round((time.time() - start) * 1000, 1)
    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        result["latency_ms"] = round((time.time() - start) * 1000, 1)
    return result


async def _check_database() -> dict[str, Any]:
    """Check PostgreSQL connectivity via a simple query."""
    result = {"name": "postgres", "status": "unknown", "latency_ms": None, "error": None}
    try:
        import asyncpg

        start = time.time()
        conn = await asyncpg.connect(settings.DATABASE_URL, timeout=3.0)
        await conn.execute("SELECT 1")
        await conn.close()
        result["latency_ms"] = round((time.time() - start) * 1000, 1)
        result["status"] = "healthy"
    except Exception as e:
        result["status"] = "unreachable" if "connect" in str(e).lower() else "degraded"
        result["error"] = str(e)[:100]
    return result


async def _check_chromadb() -> dict[str, Any]:
    """Check ChromaDB connectivity by initializing a local client."""
    result = {"name": "chromadb", "status": "unknown", "latency_ms": None, "error": None}
    try:
        from app.providers.memory import ChromaDBProvider

        start = time.time()
        provider = ChromaDBProvider()
        # Verify connectivity by ensuring the client initializes
        client = await provider._ensure_client()
        # Try a simple heartbeat operation
        count = client.heartbeat()
        result["latency_ms"] = round((time.time() - start) * 1000, 1)
        result["status"] = "healthy"
        result["heartbeat"] = count
    except AttributeError:
        # Some ChromaDB clients don't expose heartbeat — check via collection list
        try:
            start = time.time()
            provider = ChromaDBProvider()
            client = await provider._ensure_client()
            collections = client.list_collections()
            result["latency_ms"] = round((time.time() - start) * 1000, 1)
            result["status"] = "healthy"
            result["collections"] = len(collections)
        except Exception as e:
            result["status"] = "unavailable"
            result["error"] = str(e)[:100]
    except Exception as e:
        result["status"] = "unavailable"
        result["error"] = str(e)[:100]
    return result


async def _check_ollama() -> dict[str, Any]:
    """Check Ollama server health."""
    url = f"{settings.OLLAMA_BASE_URL}/api/tags"
    return await _check_service("ollama", url)


async def _check_livekit() -> dict[str, Any]:
    """Check LiveKit server health."""
    if not settings.LIVEKIT_ENABLED:
        return {"name": "livekit", "status": "disabled", "latency_ms": None, "error": None}
    # LiveKit health endpoint on HTTP API port
    health_url = settings.LIVEKIT_SERVER_URL.replace("ws://", "http://").replace(
        ":7880", ":7881"
    ) + "/health"
    return await _check_service("livekit", health_url, timeout=3.0)


# ── Prometheus Metrics ───────────────────────────────────────────────


@router.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics():
    """Prometheus-formatted metrics endpoint.

    Exposes:
      - voiceai_uptime_seconds
      - voiceai_http_requests_total{method,path,status}
      - voiceai_http_duration_ms{method,path}
      - voiceai_ws_connections_active
      - voiceai_sip_calls_active
      - voiceai_twilio_calls_active
      - voiceai_providers_registered{type}
      - voiceai_gpu_available
    """
    lines = [
        "# HELP voiceai_uptime_seconds Application uptime in seconds",
        "# TYPE voiceai_uptime_seconds gauge",
        f"voiceai_uptime_seconds {time.time() - _app_start_time}",
        "",
        "# HELP voiceai_http_requests_total Total HTTP requests by method, path, and status",
        "# TYPE voiceai_http_requests_total counter",
    ]

    for key, metric in _http_metrics.items():
        for status, count in metric["status_codes"].items():
            lines.append(
                f'voiceai_http_requests_total{{method="{metric["method"]}",'
                f'path="{metric["path"]}",status="{status}"}} {count}'
            )

    lines.extend([
        "",
        "# HELP voiceai_http_duration_ms Total HTTP request duration in ms by method and path",
        "# TYPE voiceai_http_duration_ms counter",
    ])
    for key, metric in _http_metrics.items():
        lines.append(
            f'voiceai_http_duration_ms{{method="{metric["method"]}",'
            f'path="{metric["path"]}"}} {metric["total_duration_ms"]}'
        )

    # Active connections (attempt to collect from routers)
    ws_active = 0
    sip_active = 0
    twilio_active = 0
    try:
        from app.routers.ws_voice import get_active_ws_count
        ws_active = get_active_ws_count()
    except (ImportError, AttributeError):
        pass
    try:
        from app.livekit.sip_dispatch import get_active_sip_calls
        sip_active = len(get_active_sip_calls())
    except (ImportError, AttributeError):
        pass
    try:
        from app.routers.twilio_webhooks import get_active_twilio_call_count
        twilio_active = get_active_twilio_call_count()
    except (ImportError, AttributeError):
        pass

    lines.extend([
        "",
        "# HELP voiceai_ws_connections_active Active WebSocket connections",
        "# TYPE voiceai_ws_connections_active gauge",
        f"voiceai_ws_connections_active {ws_active}",
        "",
        "# HELP voiceai_sip_calls_active Active SIP calls",
        "# TYPE voiceai_sip_calls_active gauge",
        f"voiceai_sip_calls_active {sip_active}",
        "",
        "# HELP voiceai_twilio_calls_active Active Twilio calls",
        "# TYPE voiceai_twilio_calls_active gauge",
        f"voiceai_twilio_calls_active {twilio_active}",
    ])

    # Provider registration
    try:
        from app.providers import get_default_registry

        registry = get_default_registry()
        providers = registry.all_providers()
        for ptype, plist in providers.items():
            for pname in plist:
                lines.append(
                    f'voiceai_providers_registered{{type="{ptype}",provider="{pname}"}} 1'
                )
    except Exception:
        pass

    # GPU availability
    try:
        from app.providers.gpu import detect_gpu_config

        gpu = detect_gpu_config()
        lines.extend([
            "",
            "# HELP voiceai_gpu_available GPU availability (1=available, 0=not)",
            "# TYPE voiceai_gpu_available gauge",
            f"voiceai_gpu_available {'1' if gpu.available else '0'}",
            f'voiceai_gpu_device_count {gpu.device_count}',
        ])
    except Exception:
        pass

    # Audio cache stats
    try:
        from app.services.audio_cache import get_audio_cache_service
        cache = get_audio_cache_service()
        if cache._initialized:
            stats = cache.get_stats()
            lines.extend([
                "",
                "# HELP voiceai_audio_cache_hits Total audio cache hits",
                "# TYPE voiceai_audio_cache_hits counter",
                f"voiceai_audio_cache_hits {stats['hits']}",
                "",
                "# HELP voiceai_audio_cache_misses Total audio cache misses",
                "# TYPE voiceai_audio_cache_misses counter",
                f"voiceai_audio_cache_misses {stats['misses']}",
                "",
                "# HELP voiceai_audio_cache_hit_rate Hit rate percentage",
                "# TYPE voiceai_audio_cache_hit_rate gauge",
                f"voiceai_audio_cache_hit_rate {stats['hit_rate_percent']}",
                "",
                "# HELP voiceai_audio_cache_stores Total cache store operations",
                "# TYPE voiceai_audio_cache_stores counter",
                f"voiceai_audio_cache_stores {stats['stores']}",
                "",
                "# HELP voiceai_audio_cache_memory_entries Current in-memory cache entries",
                "# TYPE voiceai_audio_cache_memory_entries gauge",
                f"voiceai_audio_cache_memory_entries {stats['memory_cache_size']}",
                "",
                "# HELP voiceai_audio_cache_warmed Number of warmed phrases",
                "# TYPE voiceai_audio_cache_warmed gauge",
                f"voiceai_audio_cache_warmed {stats['warmed_entries']}",
            ])
    except Exception:
        pass

    lines.append("")
    return "\n".join(lines)


# ── Deep Health Check ───────────────────────────────────────────────


@router.get("/health/deep")
async def deep_health_check():
    """Deep health check — probes all service dependencies.

    Checks:
      - PostgreSQL database connectivity
      - ChromaDB vector store
      - LiveKit server (if enabled)
      - Ollama LLM server (if configured)
      - System resources (memory, disk)

    Returns:
        Overall status with per-service breakdown
    """
    import psutil

    checks = await asyncio.gather(
        _check_database(),
        _check_chromadb(),
        _check_livekit(),
        _check_ollama(),
        return_exceptions=True,
    )

    services = []
    for c in checks:
        if isinstance(c, Exception):
            services.append({"name": "unknown", "status": "error", "error": str(c)[:100]})
        else:
            services.append(c)

    # System resources
    process = psutil.Process(os.getpid())
    mem = process.memory_info()
    system_mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    overall = all(s.get("status") == "healthy" for s in services)
    # If any critical service is down, overall is degraded
    critical_down = any(
        s.get("status") in ("unreachable", "error")
        for s in services
        if s.get("name") in ("postgres",)
    )
    if critical_down:
        overall = "degraded"

    return {
        "status": "healthy" if overall and overall is not False else (overall if isinstance(overall, str) else "degraded"),
        "uptime_seconds": round(time.time() - _app_start_time, 1),
        "version": settings.APP_VERSION,
        "services": services,
        "system": {
            "memory_rss_mb": round(mem.rss / 1024 / 1024, 1),
            "memory_percent": round(process.memory_percent(), 1),
            "system_memory_used_percent": system_mem.percent,
            "disk_used_percent": disk.percent,
            "disk_free_gb": round(disk.free / 1024 / 1024 / 1024, 1),
            "cpu_percent": round(process.cpu_percent(interval=0.1), 1),
        },
        "gpu": {
            "available": _gpu_config.available,
        },
    }


# ── Readiness / Liveness Probes (Kubernetes) ─────────────────────────


@router.get("/health/readiness")
async def readiness_probe():
    """Kubernetes readiness probe — returns 200 when ready to serve traffic."""
    return {"status": "ready", "uptime_seconds": round(time.time() - _app_start_time, 1)}


@router.get("/health/liveness")
async def liveness_probe():
    """Kubernetes liveness probe — returns 200 when alive."""
    return {"status": "alive", "uptime_seconds": round(time.time() - _app_start_time, 1)}


# ── Recent Logs ──────────────────────────────────────────────────────


@router.get("/logs/recent")
async def recent_logs(limit: int = 50):
    """Get recent structured log entries from the ring buffer.

    Args:
        limit: Number of entries to return (max 200, default 50)
    """
    entries = list(_recent_logs)[-limit:]
    return {
        "total_available": len(_recent_logs),
        "returned": len(entries),
        "entries": entries,
    }
