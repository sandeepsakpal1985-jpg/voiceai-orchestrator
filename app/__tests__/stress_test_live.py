"""
Live API Stress Test — 20 concurrent voice pipeline calls.
Hits the running API server at http://localhost:8000 with JWT auth.
"""

import asyncio
import json
import time
import statistics
import sys
import aiohttp

BASE_URL = "http://localhost:8000"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3OTg4ODA0NiwiZXhwIjoxNzc5ODkxNjQ2fQ.ZlERNThDyf21KNehM2b_2hr8gRae4ZWEJRr2NYgSPKA"
HEADERS = {"Authorization": f"Bearer {AUTH_TOKEN}", "Content-Type": "application/json"}


async def call_llm(client, session_id: int) -> dict:
    """Send a single LLM request and measure response time."""
    url = f"{BASE_URL}/voice/complete"
    payload = {
        "messages": [
            {"role": "user", "content": "What is 2+2? Answer in one sentence."}
        ]
    }
    start = time.monotonic()
    try:
        async with client.post(url, json=payload, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            elapsed = time.monotonic() - start
            body = await resp.text()
            ok = resp.status == 200
            return {
                "ok": ok,
                "status": resp.status,
                "latency": elapsed,
                "session": session_id,
                "body_len": len(body),
                "error": None if ok else f"HTTP {resp.status}: {body[:80]}",
            }
    except Exception as e:
        elapsed = time.monotonic() - start
        return {
            "ok": False,
            "status": 0,
            "latency": elapsed,
            "session": session_id,
            "body_len": 0,
            "error": str(e),
        }


async def call_tts(client, session_id: int) -> dict:
    """Send a single TTS request and measure response time."""
    url = f"{BASE_URL}/voice/synthesize"
    payload = {
        "text": "Hello, this is a test of the voice synthesis system.",
        "voice_id": "af_bella",
        "language": "en",
    }
    start = time.monotonic()
    try:
        async with client.post(url, json=payload, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            elapsed = time.monotonic() - start
            ok = resp.status == 200
            body = await resp.read()
            return {
                "ok": ok,
                "status": resp.status,
                "latency": elapsed,
                "session": session_id,
                "body_len": len(body),
                "error": None if ok else f"HTTP {resp.status}",
            }
    except Exception as e:
        elapsed = time.monotonic() - start
        return {
            "ok": False,
            "status": 0,
            "latency": elapsed,
            "session": session_id,
            "body_len": 0,
            "error": str(e),
        }


async def run_stress(name: str, concurrency: int, call_fn, ramp_up: float = 0.05) -> list[dict]:
    """Run concurrent calls with ramp-up delay."""
    connector = aiohttp.TCPConnector(limit=100)
    async with aiohttp.ClientSession(connector=connector) as client:
        tasks = []
        for i in range(concurrency):
            tasks.append(asyncio.create_task(call_fn(client, i + 1)))
            if ramp_up > 0:
                await asyncio.sleep(ramp_up)
        results = await asyncio.gather(*tasks)
    return results


def compute_stats(results: list[dict]) -> dict:
    """Compute p50/p95/p99 latency, throughput, error rate."""
    ok_results = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    latencies = sorted([r["latency"] for r in ok_results])

    if not latencies:
        return {"total": len(results), "passed": 0, "failed": len(failed),
                "error_rate": 1.0, "p50": 0, "p95": 0, "p99": 0,
                "throughput": 0, "note": "ALL REQUESTS FAILED"}

    total_time = max(r["latency"] for r in results)
    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)]
    p99 = latencies[int(len(latencies) * 0.99)]

    return {
        "total": len(results),
        "passed": len(ok_results),
        "failed": len(failed),
        "error_rate": len(failed) / len(results),
        "p50": round(p50, 3),
        "p95": round(p95, 3),
        "p99": round(p99, 3),
        "throughput": round(len(ok_results) / total_time, 1) if total_time > 0 else 0,
        "min_latency": round(latencies[0], 3),
        "max_latency": round(latencies[-1], 3),
    }


async def main():
    # 1. Health check
    print()
    print("=" * 60)
    print("VOICEAI ORCHESTRATOR - LIVE STRESS TEST")
    print("=" * 60)

    async with aiohttp.ClientSession() as session:
        async with session.get(f"{BASE_URL}/health") as resp:
            body = await resp.json()
            print(f"[1/4] Health check: {resp.status}")
            print(f"      Status: {body.get('status', 'unknown')}")

    # 2. LLM quick test
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{BASE_URL}/voice/complete",
                                json={"messages": [{"role": "user", "content": "Say hello in one word."}]},
                                headers=HEADERS) as resp:
            if resp.status == 200:
                text = await resp.text()
                short = text.strip()[:80]
                print(f"[2/4] LLM quick test: {resp.status} - response: {short}")
            else:
                body = await resp.text()
                print(f"[2/4] LLM quick test: {resp.status} - {body[:100]}")

    # 3. Stress test - 20 concurrent LLM calls
    print(f"[3/4] Stress test: 20 concurrent LLM calls...")
    start = time.monotonic()
    results = await run_stress("LLM", 20, call_llm, ramp_up=0.05)
    elapsed = time.monotonic() - start
    stats = compute_stats(results)
    print(f"      Total time: {elapsed:.2f}s")
    print(f"      Passed: {stats['passed']}/{stats['total']} | Failed: {stats['failed']}")
    print(f"      Error rate: {stats['error_rate']*100:.1f}%")
    print(f"      Latency: p50={stats['p50']}s  p95={stats['p95']}s  p99={stats['p99']}s")
    print(f"      Throughput: {stats['throughput']} req/s")

    if stats['failed'] > 0:
        print(f"      --- Failure details ---")
        for r in results:
            if not r["ok"]:
                print(f"      Session {r['session']}: {r['error']} ({r['latency']:.2f}s)")

    # 4. TTS burst - 10 concurrent TTS calls
    print(f"[4/4] TTS burst: 10 concurrent synthesis requests...")
    start = time.monotonic()
    tts_results = await run_stress("TTS", 10, call_tts, ramp_up=0.1)
    elapsed = time.monotonic() - start
    tts_stats = compute_stats(tts_results)
    print(f"      Total time: {elapsed:.2f}s")
    print(f"      Passed: {tts_stats['passed']}/{tts_stats['total']} | Failed: {tts_stats['failed']}")
    print(f"      Error rate: {tts_stats['error_rate']*100:.1f}%")
    print(f"      Latency: p50={tts_stats['p50']}s  p95={tts_stats['p95']}s  p99={tts_stats['p99']}s")

    # Summary
    print()
    print("=" * 60)
    print("STRESS TEST SUMMARY")
    print("=" * 60)
    verdict = "PASS" if stats['error_rate'] < 0.2 else "FAIL (error rate > 20%)"
    print(f"LLM (20 concurrent): {stats['passed']}/{stats['total']} passed, "
          f"latency p95={stats['p95']}s, p99={stats['p99']}s - {verdict}")
    verdict_tts = "PASS" if tts_stats['error_rate'] < 0.3 else "FAIL (error rate > 30%)"
    print(f"TTS (10 concurrent): {tts_stats['passed']}/{tts_stats['total']} passed, "
          f"latency p95={tts_stats['p95']}s - {verdict_tts}")
    print()

    return 0 if (stats['error_rate'] < 0.2 and tts_stats['error_rate'] < 0.3) else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
