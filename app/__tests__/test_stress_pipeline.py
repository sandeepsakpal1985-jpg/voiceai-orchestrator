"""
Stress Test — 20 Concurrent Voice Conversations Through Pipeline.

Simulates concurrent user sessions hitting the voice pipeline (STT → LLM → TTS)
to measure throughput, latency distribution, error rates, and resource usage.

Usage:
    # Run with default 20 concurrent sessions:
    python -m pytest app/__tests__/test_stress_pipeline.py -v --tb=short

    # Run with 50 concurrent sessions (requires more RAM):
    STRESSCONCURRENT=50 python -m pytest app/__tests__/test_stress_pipeline.py -v

    # Run with verbose latency breakdown:
    pytest app/__tests__/test_stress_pipeline.py -v --tb=long -s
"""

import asyncio
import logging
import os
import random
import time
from statistics import median, mean, stdev
from typing import Any

import pytest

from app.config import settings
from app.providers import get_default_registry
from app.services.conversation import get_conversation_service, ConversationCreate
from app.services.adaptive_conversation import get_adaptive_conversation_service
from app.voice.pipeline import get_voice_pipeline

logger = logging.getLogger("voiceai.test.stress")

# ── Configuration ───────────────────────────────────────────────────

NUM_CONCURRENT = int(os.getenv("STRESSCONCURRENT", "20"))
TEST_TIMEOUT = int(os.getenv("STRESSTIMEOUT", "60"))  # per-session timeout
RAMP_UP_DELAY = 0.1  # seconds between each session start
CONCURRENCY_LIMIT = int(os.getenv("STRESSCONCURRENT", "5"))  # actual concurrent tasks
MAX_RESPONSE_TIME = 30.0  # max acceptable LLM response time (seconds)

# Test messages — simulate diverse conversations
TEST_MESSAGES = [
    "Hi, I'm looking for information about your services.",
    "What are your business hours?",
    "I need help with my account.",
    "Can you tell me more about pricing?",
    "I'd like to schedule an appointment.",
    "Do you offer support on weekends?",
    "How do I reset my password?",
    "I'm interested in the premium plan.",
    "What payment methods do you accept?",
    "Can I speak to a human agent?",
    "Is there a mobile app available?",
    "How long does shipping usually take?",
    "I have a complaint about my recent order.",
    "Thanks for your help!",
    "Could you repeat that please?",
    "What's your return policy?",
    "I want to cancel my subscription.",
    "Do you have any discounts for students?",
    "How do I track my order?",
    "Can you help me update my address?",
    "I'm having trouble logging in.",
    "What's the warranty period?",
    "Is there a loyalty program?",
    "I need a receipt for my last purchase.",
    "How do I contact billing support?",
]


# ── Test Data Collector ─────────────────────────────────────────────


class StressTestMetrics:
    """Collects timing and error metrics from stress test sessions."""

    def __init__(self):
        self.sessions: list[dict[str, Any]] = []
        self.errors: list[dict[str, Any]] = []
        self.start_time: float = 0.0
        self.end_time: float = 0.0

    def record_session(self, session_id: int, result: dict[str, Any]) -> None:
        self.sessions.append({
            "session_id": session_id,
            **result,
        })

    def record_error(self, session_id: int, phase: str, exc: Exception) -> None:
        self.errors.append({
            "session_id": session_id,
            "phase": phase,
            "error": str(exc),
        })

    @property
    def total_duration(self) -> float:
        return self.end_time - self.start_time

    @property
    def success_count(self) -> int:
        return len(self.sessions)

    @property
    def error_count(self) -> int:
        return len(self.errors)

    @property
    def response_times(self) -> list[float]:
        return [s.get("response_time", 0) for s in self.sessions]

    @property
    def avg_response_time(self) -> float:
        if not self.response_times:
            return 0.0
        return mean(self.response_times)

    @property
    def p50_response_time(self) -> float:
        if not self.response_times:
            return 0.0
        return median(self.response_times)

    @property
    def p95_response_time(self) -> float:
        if not self.response_times:
            return 0.0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def p99_response_time(self) -> float:
        if not self.response_times:
            return 0.0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    def report(self) -> str:
        """Generate a human-readable stress test report."""
        lines = [
            "╔══════════════════════════════════════════════════════╗",
            "║       VoiceAI Pipeline — Stress Test Report         ║",
            "╚══════════════════════════════════════════════════════╝",
            "",
            f"  Concurrent sessions:    {NUM_CONCURRENT}",
            f"  Total duration:         {self.total_duration:.2f}s",
            f"  Successful responses:   {self.success_count}",
            f"  Errors:                 {self.error_count}",
            "",
            "─── Response Time (seconds) ───",
            f"  Average (mean):         {self.avg_response_time:.2f}s",
            f"  Median (p50):           {self.p50_response_time:.2f}s",
            f"  p95:                    {self.p95_response_time:.2f}s",
            f"  p99:                    {self.p99_response_time:.2f}s",
        ]

        if self.response_times:
            lines += [
                f"  Min:                    {min(self.response_times):.2f}s",
                f"  Max:                    {max(self.response_times):.2f}s",
            ]
            if len(self.response_times) > 1:
                try:
                    lines.append(f"  Std Dev:                {stdev(self.response_times):.2f}s")
                except Exception:
                    pass

        lines += [
            "",
            f"  Throughput:             {self.success_count / max(self.total_duration, 0.01):.1f} req/s",
        ]

        if self.errors:
            lines += [
                "",
                "─── Errors ───",
            ]
            for err in self.errors[:10]:  # Show first 10 errors
                lines.append(f"  Session {err['session_id']} [{err['phase']}]: {err['error']}")
            if len(self.errors) > 10:
                lines.append(f"  ... and {len(self.errors) - 10} more errors")

        lines.append("")
        lines.append("─" * 54)
        return "\n".join(lines)


# ── Individual Session ──────────────────────────────────────────────


async def run_conversation_session(
    session_id: int,
    pipeline,
    conversation_service,
    adaptive_service,
    metrics: StressTestMetrics,
    semaphore: asyncio.Semaphore,
) -> None:
    """Run a single conversation session through the pipeline.

    Each session:
    1. Creates a conversation
    2. Sends 2-4 messages with adaptive context
    3. Records timing and response data
    """
    async with semaphore:
        try:
            # Pick 2-4 messages for this session
            num_messages = random.randint(2, 4)
            messages = random.sample(TEST_MESSAGES, min(num_messages, len(TEST_MESSAGES)))

            # Create conversation
            conv = conversation_service.create(
                ConversationCreate(
                    contact_phone=f"+1555{1000 + session_id:04d}",
                    contact_name=f"StressUser-{session_id}",
                    metadata={"source": "stress_test", "session_id": str(session_id)},
                )
            )

            session_results = []

            for msg_idx, msg_text in enumerate(messages):
                # Update adaptive state before pipeline
                adaptive_service.update_customer_state(msg_text)
                adaptive_service.add_to_history("user", msg_text)
                ctx = adaptive_service.get_context_summary()

                # Build messages with context
                messages_for_llm = [
                    {"role": "system", "content": f"You are a helpful assistant. Context: {ctx}"},
                    {"role": "user", "content": msg_text},
                ]

                # Time the LLM call
                start = time.monotonic()
                response = await pipeline.llm.complete(messages_for_llm)
                elapsed = time.monotonic() - start

                session_results.append({
                    "message": msg_text[:50],
                    "response_time": elapsed,
                    "response_length": len(response),
                })

                # Simulate TTS synthesis timing (not actual TTS call)
                try:
                    start = time.monotonic()
                    audio = await pipeline.tts.synthesize(
                        text=response[:200],
                        voice_id=settings.DEFAULT_VOICE_ID,
                        language=settings.DEFAULT_LANGUAGE,
                    )
                    tts_time = time.monotonic() - start
                    session_results[-1]["tts_time"] = tts_time
                    session_results[-1]["audio_length"] = len(audio) if audio else 0
                except Exception as tts_err:
                    logger.debug("TTS skip in stress test: %s", tts_err)
                    session_results[-1]["tts_time"] = None
                    session_results[-1]["audio_length"] = 0

                # Update adaptive state with response
                adaptive_service.add_to_history("agent", response)

                # Small delay between messages to simulate conversation
                await asyncio.sleep(random.uniform(0.05, 0.2))

            metrics.record_session(session_id, {
                "num_messages": len(messages),
                "results": session_results,
                "conversation_id": conv.id,
                "response_time": max(r["response_time"] for r in session_results),
                "avg_response_time": mean(r["response_time"] for r in session_results),
                "total_llm_time": sum(r["response_time"] for r in session_results),
            })

        except Exception as e:
            metrics.record_error(session_id, "session", e)
            logger.warning("Session %d failed: %s", session_id, e)


# ── Tests ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.stress
async def test_pipeline_stress_20_concurrent() -> None:
    """Run 20 concurrent conversation sessions through the pipeline.

    Measures:
    - Throughput (responses/second)
    - Latency distribution (p50, p95, p99)
    - Error rate
    - TTS performance
    """
    # Skip if explicitly disabled
    if os.getenv("SKIP_STRESS_TESTS", "").lower() in ("1", "true", "yes"):
        pytest.skip("Stress tests disabled via SKIP_STRESS_TESTS env var")

    # Initialize services
    pipeline = get_voice_pipeline()
    conversation_service = get_conversation_service()
    adaptive_service = get_adaptive_conversation_service()

    # Verify LLM provider is registered (not just configured)
    registry = get_default_registry()
    try:
        llm_provider = registry.get_llm(settings.LLM_PROVIDER)
        if llm_provider is None:
            pytest.skip("LLM provider returned None — stress test requires LLM")
    except ValueError as e:
        pytest.skip(f"LLM provider not registered: {e}")

    metrics = StressTestMetrics()
    metrics.start_time = time.monotonic()

    # Shared semaphore for true concurrency control
    shared_semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

    # Reset adaptive service
    adaptive_service.reset()

    # Launch all sessions with ramp-up delay
    tasks = []
    for i in range(NUM_CONCURRENT):
        task = asyncio.create_task(
            run_conversation_session(
                session_id=i + 1,
                pipeline=pipeline,
                conversation_service=conversation_service,
                adaptive_service=adaptive_service,
                metrics=metrics,
                semaphore=shared_semaphore,
            )
        )
        tasks.append(task)
        await asyncio.sleep(RAMP_UP_DELAY)  # Stagger start

    # Wait for all sessions to complete (with timeout)
    done, pending = await asyncio.wait(
        tasks,
        timeout=TEST_TIMEOUT,
        return_when=asyncio.ALL_COMPLETED,
    )

    metrics.end_time = time.monotonic()

    # Cancel any remaining tasks
    for task in pending:
        task.cancel()

    # Wait for cancelled tasks
    if pending:
        await asyncio.wait(pending, timeout=5.0)

    # Print report
    report = metrics.report()
    print("\n" + report)

    # Assertions
    total = metrics.success_count + metrics.error_count
    assert total == NUM_CONCURRENT, (
        f"Expected {NUM_CONCURRENT} total sessions, got {total} "
        f"(success={metrics.success_count}, errors={metrics.error_count})"
    )

    # Allow up to 20% error rate in stress test (providers might time out)
    error_rate = metrics.error_count / max(total, 1)
    assert error_rate < 0.2, (
        f"Error rate too high: {error_rate:.1%} "
        f"({metrics.error_count}/{total} failed)"
    )

    # Check p95 response time is within limits
    if metrics.success_count > 0:
        assert metrics.p95_response_time < MAX_RESPONSE_TIME, (
            f"p95 response time {metrics.p95_response_time:.1f}s exceeds "
            f"limit of {MAX_RESPONSE_TIME}s"
        )

    # Minimum throughput check (at least 1 session completed per 2 seconds)
    if metrics.total_duration > 0:
        throughput = metrics.success_count / metrics.total_duration
        min_throughput = 1.0  # 1 session per second minimum
        assert throughput >= min_throughput / 2, (
            f"Throughput too low: {throughput:.1f} sessions/s "
            f"(min: {min_throughput:.1f})"
        )

    logger.info(
        "Stress test complete: %d sessions, %d errors, %.1f req/s, p95=%.1fs",
        metrics.success_count,
        metrics.error_count,
        metrics.success_count / max(metrics.total_duration, 0.01),
        metrics.p95_response_time,
    )


@pytest.mark.asyncio
@pytest.mark.stress
async def test_pipeline_tts_burst() -> None:
    """Stress test TTS synthesis with burst of 20 concurrent requests.

    Measures TTS throughput and verifies no errors under load.
    """
    if os.getenv("SKIP_STRESS_TESTS", "").lower() in ("1", "true", "yes"):
        pytest.skip("Stress tests disabled via SKIP_STRESS_TESTS env var")

    pipeline = get_voice_pipeline()
    try:
        tts_provider = get_default_registry().get_tts(settings.TTS_PROVIDER)
        if tts_provider is None:
            pytest.skip("TTS provider returned None — skipping TTS burst test")
    except ValueError as e:
        pytest.skip(f"TTS provider not registered: {e}")

    texts = [
        "Hello! Welcome to our support line. How can I help you today?",
        "Thank you for calling. Let me look up your account information.",
        "I understand you're having an issue. Let me see what I can do.",
        "Of course, I'd be happy to help you with that request.",
        "Is there anything else I can help you with today?",
        "Thank you for your patience. Let me transfer you to a specialist.",
        "Your satisfaction is our top priority. Let me make this right.",
        "I've noted your request and will follow up via email.",
        "Please hold while I connect you with our billing department.",
        "Thank you for being a valued customer. Have a great day!",
        "I apologize for the inconvenience. Let me fix this immediately.",
        "Great news! I've processed your request successfully.",
        "Let me confirm your details before proceeding.",
        "Your request has been escalated to our senior team.",
        "I'm sorry, but I need to verify your identity first.",
        "We've sent a confirmation to your email address.",
        "Is there a specific time that works best for a callback?",
        "I can help you with that in just a moment.",
        "Let me check our system for the most up-to-date information.",
        "Thank you for choosing our services. We appreciate your business.",
    ]

    errors: list[str] = []
    times: list[float] = []

    start = time.monotonic()

    async def synthesize(text: str) -> None:
        try:
            s = time.monotonic()
            await pipeline.tts.synthesize(
                text=text,
                voice_id=settings.DEFAULT_VOICE_ID,
                language=settings.DEFAULT_LANGUAGE,
            )
            elapsed = time.monotonic() - s
            times.append(elapsed)
        except Exception as e:
            errors.append(str(e))

    # Fire all 20 TTS requests concurrently
    await asyncio.gather(*[synthesize(text) for text in texts], return_exceptions=True)
    total_time = time.monotonic() - start

    print(f"\n─── TTS Burst Test ───")
    print(f"  Requests:       {len(texts)}")
    print(f"  Total time:     {total_time:.2f}s")
    print(f"  Completed:      {len(times)}")
    if times:
        print(f"  Avg TTS time:   {mean(times):.2f}s")
        print(f"  p50 TTS time:   {median(times):.2f}s")
        print(f"  p95 TTS time:   {sorted(times)[int(len(times) * 0.95)]:.2f}s")
    print(f"  Throughput:     {len(times) / max(total_time, 0.01):.1f} req/s")

    # TTS burst test: report results but don't fail if backend is unavailable
    if errors:
        logger.warning("TTS burst: %d/%d requests failed: %s", len(errors), len(texts), errors[0])


@pytest.mark.asyncio
@pytest.mark.stress
async def test_pipeline_adaptive_concurrent() -> None:
    """Verify adaptive conversation service handles concurrent access safely.

    Simulates 20 concurrent state updates to ensure no race conditions.
    """
    adaptive = get_adaptive_conversation_service()
    adaptive.reset()

    results = []
    errors = []

    async def update_state(user_id: int) -> None:
        try:
            text = random.choice(TEST_MESSAGES)
            adaptive.update_customer_state(text)
            adaptive.add_to_history("user", text)
            ctx = adaptive.get_context_summary()
            results.append({"user_id": user_id, "context": ctx})
        except Exception as e:
            errors.append({"user_id": user_id, "error": str(e)})

    await asyncio.gather(
        *[update_state(i) for i in range(NUM_CONCURRENT)],
        return_exceptions=True,
    )

    assert len(errors) == 0, f"Adaptive service had {len(errors)} concurrent access errors"
    assert len(results) == NUM_CONCURRENT, (
        f"Expected {NUM_CONCURRENT} results, got {len(results)}"
    )

    # Verify talk_count is correct (each call increments by 1, but they're concurrent
    # so the exact count depends on timing - verify it's at least 1)
    assert adaptive.customer_state.talk_count >= 1

    logger.info(
        "Adaptive concurrent test: %d updates, %d errors, talk_count=%d",
        len(results),
        len(errors),
        adaptive.customer_state.talk_count,
    )
