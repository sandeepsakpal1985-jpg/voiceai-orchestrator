"""
Live Demo — Tests the API endpoints and stress test in-process.
Runs via TestClient so AUTH_BYPASS works reliably (same process).
"""

import os
import sys
import time
import asyncio
import json
from statistics import mean, median

# Bypass auth
os.environ["AUTH_BYPASS"] = "true"

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.providers.base import get_default_registry

client = TestClient(app)

print("=" * 54)
print("  VoiceAI Orchestrator -- Live Demo")
print("=" * 54)
print()

# ── 1. Health Check ────────────────────────────────────────
print("--- 1) HEALTH CHECK ---")
r = client.get("/health")
print(f"  Status: {r.status_code}")
print(f"  Body: {json.dumps(r.json(), indent=2)}")
print()

# ── 2. Providers ───────────────────────────────────────────
print("--- 2) PROVIDERS ---")
r = client.get("/providers")
print(f"  Status: {r.status_code}")
data = r.json()
for ptype, providers in data.items():
    print(f"  {ptype}: {providers if isinstance(providers, list) else 'ok'}")
print()

# ── 3. Deep Health ─────────────────────────────────────────
print("--- 3) DEEP HEALTH ---")
r = client.get("/health/deep")
print(f"  Status: {r.status_code}")
data = r.json()
print(f"  Status: {data.get('status')}")
print(f"  Services: {json.dumps(data.get('services', {}), indent=2)}")
if 'system' in data:
    mem = data['system'].get('memory', {})
    print(f"  Memory: {mem.get('used_mb', '?')}MB / {mem.get('total_mb', '?')}MB")
print()

# ── 4. Languages ───────────────────────────────────────────
print("--- 4) LANGUAGES ---")
r = client.get("/api/languages")
print(f"  Status: {r.status_code}")
langs = r.json().get("languages", [])
print(f"  Supported languages: {len(langs)}")
for lang in langs[:5]:
    print(f"    {lang['code']} -- {lang['name']} (STT: {lang.get('stt')})")
print()

# ── 5. Runtime Status ──────────────────────────────────────
print("--- 5) RUNTIME STATUS ---")
r = client.get("/runtime/status")
print(f"  Status: {r.status_code}")
print()

# ── 6. LLM Completion ──────────────────────────────────────
print("--- 6) LLM COMPLETION ---")
r = client.post("/voice/complete", json={
    "messages": [{"role": "user", "content": "Say hello in one sentence."}]
})
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    response_text = r.text[:200]
    print(f"  Response: {response_text}")
elif r.status_code == 401:
    print(f"  Response: AUTH REQUIRED (TestClient bypass may need debugging)")
print()

# ── 7. Create Conversation + Message ──────────────────────
print("--- 7) CONVERSATION CRUD ---")
r = client.post("/conversations", json={
    "contact_phone": "+15551234567",
    "contact_name": "Demo User"
})
print(f"  Create: {r.status_code}")
if r.status_code == 200:
    conv_id = r.json().get("id")
    print(f"  Conversation ID: {conv_id}")

    r2 = client.post(f"/conversations/{conv_id}/messages", json={
        "role": "user",
        "content": "Hello from the live demo!"
    })
    print(f"  Add message: {r2.status_code}")

    r3 = client.get(f"/conversations/{conv_id}/messages")
    print(f"  Get messages: {r3.status_code}")
    if r3.status_code == 200:
        msgs = r3.json()
        msgs_list = msgs if isinstance(msgs, list) else msgs.get("messages", [])
        print(f"  Messages: {len(msgs_list)}")
        for m in msgs_list[:3]:
            print(f"    [{m.get('role')}] {m.get('content', '')[:80]}")
print()

# ── 8. Stress Test (LLM) ──────────────────────────────────
print("--- 8) LLM STRESS TEST (20 concurrent) ---")

registry = get_default_registry()
llm_providers = registry.list_llm_providers()
print(f"  Registered LLM providers: {llm_providers}")

try:
    llm = registry.get_llm(settings.LLM_PROVIDER)
    print(f"  Using provider: {type(llm).__name__}")

    messages_pool = [
        [{"role": "user", "content": "Say hello in one sentence."}],
        [{"role": "user", "content": "What is 2+2? Answer briefly."}],
        [{"role": "user", "content": "Name the capital of France."}],
        [{"role": "user", "content": "What color is the sky? Answer briefly."}],
        [{"role": "user", "content": "Is water wet? Answer briefly."}],
        [{"role": "user", "content": "What's the opposite of hot?"}],
        [{"role": "user", "content": "Name a famous scientist."}],
        [{"role": "user", "content": "What's the speed of light? Approx."}],
        [{"role": "user", "content": "How many continents are there?"}],
        [{"role": "user", "content": "What year did WW2 end?"}],
        [{"role": "user", "content": "What's the largest ocean?"}],
        [{"role": "user", "content": "Name the tallest mountain on Earth."}],
        [{"role": "user", "content": "What does CPU stand for?"}],
        [{"role": "user", "content": "What planet is known as the Red Planet?"}],
        [{"role": "user", "content": "What's the chemical symbol for gold?"}],
        [{"role": "user", "content": "How many days in a year? (approx)"}],
        [{"role": "user", "content": "What's the main language in Brazil?"}],
        [{"role": "user", "content": "Name a programming language."}],
        [{"role": "user", "content": "What's 10 * 10? Answer briefly."}],
        [{"role": "user", "content": "Say goodbye in one word."}],
    ]

    times = []
    errors = []

    async def run_llm_task(messages):
        try:
            start = time.monotonic()
            response = await llm.complete(messages)
            elapsed = time.monotonic() - start
            return elapsed, len(response), response
        except Exception as e:
            return None, 0, str(e)

    async def run_stress():
        tasks = [run_llm_task(msgs) for msgs in messages_pool]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, tuple) and r[0] is not None:
                times.append(r[0])
            elif isinstance(r, Exception):
                errors.append(str(r))

    asyncio.run(run_stress())

    print(f"  Successful: {len(times)} / {len(messages_pool)}")
    if errors:
        print(f"  Errors: {len(errors)} -- {errors[0][:100]}")

    if times:
        print(f"  --- Latency (seconds) ---")
        times.sort()
        print(f"  Min:    {min(times):.2f}s")
        print(f"  p50:    {median(times):.2f}s")
        print(f"  p95:    {times[int(len(times)*0.95)]:.2f}s")
        print(f"  p99:    {times[int(len(times)*0.99)]:.2f}s")
        print(f"  Max:    {max(times):.2f}s")
        print(f"  Mean:   {mean(times):.2f}s")
        print(f"  Throughput: {len(times)/max(sum(times), 0.01):.1f} req/s")
    print()

except ValueError as e:
    print(f"  SKIPPED -- {e}")
print()

# ── 9. Full Test Suite ─────────────────────────────────────
print("--- 9) RUNNING FULL TEST SUITE ---")
import subprocess
result = subprocess.run(
    [sys.executable, "-m", "pytest", "app/__tests__/", "-q", "--tb=line"],
    capture_output=True, text=True, timeout=120
)
for line in result.stdout.strip().split("\n")[-8:]:
    print(f"  {line}")
if result.returncode != 0:
    for line in result.stderr.strip().split("\n")[-3:]:
        print(f"  ! {line}")
print(f"  Exit code: {result.returncode}")
print()

print("=" * 54)
print("  LIVE DEMO COMPLETE")
print("=" * 54)
