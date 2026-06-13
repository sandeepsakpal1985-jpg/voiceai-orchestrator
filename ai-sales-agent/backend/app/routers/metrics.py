"""
Metrics Routes — Latency tracking, performance monitoring, and system metrics.

Exposes:
  GET /metrics/latency          — Aggregate latency stats
  GET /metrics/latency/recent   — Recent per-turn records
  GET /metrics/latency/{conversation_id} — Record for a specific conversation
"""

from fastapi import APIRouter

from app.services.latency_tracker import get_latency_tracker

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/latency")
async def get_latency_metrics(window_minutes: int = 10):
    """Get aggregate latency statistics across all recent calls.

    Returns average and P95 latencies for STT, LLM, and TTS stages
    over the specified time window (default: last 10 minutes).
    """
    tracker = get_latency_tracker()
    return tracker.get_aggregate_stats(window_minutes=window_minutes)


@router.get("/latency/recent")
async def get_recent_latency_records(limit: int = 20):
    """Get the most recent per-turn latency records."""
    tracker = get_latency_tracker()
    return {"records": tracker.get_recent_records(limit=limit), "total": limit}


@router.get("/latency/{conversation_id}")
async def get_conversation_latency(conversation_id: str):
    """Get latency record for a specific conversation."""
    tracker = get_latency_tracker()
    record = tracker.get_record(conversation_id)
    if record is None:
        return {"error": "No latency record found for this conversation", "conversation_id": conversation_id}
    return {"record": record, "conversation_id": conversation_id}
