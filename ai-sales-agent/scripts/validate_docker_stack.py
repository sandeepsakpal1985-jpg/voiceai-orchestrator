"""
Docker Stack Validation Script

Checks all services in the Docker stack:
  - Backend (HTTP health)
  - Redis (ping)
  - Ollama (API tags)
  - FreeSWITCH (ESL port, SIP port, FS HTTP API)
  - Health endpoints (/health, /health/stt, /health/llm, /health/tts)

Outputs PASS/FAIL per check with remediation guidance.
Exit code: 0 = all pass, 1 = any fail
"""

import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime
from typing import Any

# ── Cross-platform encoding fix ────────────────────────────────────
_ENCODING = getattr(sys.stdout, "encoding", None) or ""
_IS_WINDOWS = sys.platform == "win32"
_USE_UNICODE = not _IS_WINDOWS or "utf" in _ENCODING.lower() or _ENCODING.lower() == "cp65001"

if _USE_UNICODE:
    H_LINE = "━"
    V_LINE = "║"
    TL = "╔"
    TR = "╗"
    BL = "╚"
    BR = "╝"
    ARROW = "→"
    STATUS_OK = "✅"
    STATUS_FAIL = "❌"
else:
    H_LINE = "="
    V_LINE = "|"
    TL = "+"
    TR = "+"
    BL = "+"
    BR = "+"
    ARROW = "->"
    STATUS_OK = "[OK]"
    STATUS_FAIL = "[!!]"

# ── Configuration ─────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
ESL_HOST = os.getenv("ESL_HOST", "127.0.0.1")
ESL_PORT = int(os.getenv("ESL_PORT", "8021"))
SIP_PORT = int(os.getenv("SIP_PORT", "5060"))
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
FREESWITCH_HTTP_URL = os.getenv("FREESWITCH_HTTP_URL", "http://localhost:8000")

DOCKER_COMPOSE_FILE = os.getenv(
    "DOCKER_COMPOSE_FILE",
    os.path.join(os.path.dirname(__file__), "..", "docker", "docker-compose.yml"),
)
FREESWITCH_COMPOSE_FILE = os.getenv(
    "FREESWITCH_COMPOSE_FILE",
    os.path.join(
        os.path.dirname(__file__), "..", "docker", "freeswitch-docker-compose.yml"
    ),
)

REQUIRED_CONTAINERS = [
    "ai-backend",
    "ai-ollama",
    "ai-redis",
]

FREESWITCH_CONTAINERS = [
    "ai-freeswitch",
    "ai-fs-backend",
    "ai-fs-ollama",
    "ai-fs-redis",
]

TIMEOUT_SEC = 10


# ── Helpers ────────────────────────────────────────────────────────

def _green(text: str) -> str:
    return f"\033[92m{text}\033[0m"


def _red(text: str) -> str:
    return f"\033[91m{text}\033[0m"


def _yellow(text: str) -> str:
    return f"\033[93m{text}\033[0m"


def _cyan(text: str) -> str:
    return f"\033[96m{text}\033[0m"


def _bold(text: str) -> str:
    return f"\033[1m{text}\033[0m"


def _print_header(title: str) -> None:
    print(f"\n{_cyan(H_LINE * 60)}")
    print(f"{_bold(f'  {title}')}")
    print(f"{_cyan(H_LINE * 60)}")


def _print_result(name: str, passed: bool, detail: str = "", guidance: str = "") -> bool:
    status = _green(f"{STATUS_OK} PASS") if passed else _red(f"{STATUS_FAIL} FAIL")
    print(f"  {status}  |  {name}")
    if detail:
        print(f"          {_yellow(f'{ARROW}')} {detail}")
    if guidance and not passed:
        print(f"          {_yellow('Fix:')} {guidance}")
    return passed


def _http_get(url: str, timeout: int = TIMEOUT_SEC) -> tuple[int, dict[str, Any] | str]:
    """Perform an HTTP GET and return (status_code, parsed_json_or_error_string)."""
    try:
        import urllib.request
        req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except Exception as e:
        return 0, str(e)


def _check_tcp_port(host: str, port: int, timeout: int = 5) -> bool:
    """Check if a TCP port is open."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def _check_docker_container(name: str) -> tuple[bool, str]:
    """Check if a Docker container is running."""
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", f"name={name}", "--format", "{{.Names}}"],
            capture_output=True, text=True, timeout=10,
        )
        containers = result.stdout.strip().split("\n")
        for c in containers:
            if c.strip() == name:
                return True, f"Container '{name}' is running"
        return False, f"Container '{name}' not found in running containers"
    except FileNotFoundError:
        return False, "Docker command not found"
    except subprocess.TimeoutExpired:
        return False, "Docker command timed out"
    except Exception as e:
        return False, str(e)


# ── Checks ─────────────────────────────────────────────────────────

def check_docker_installed() -> tuple[bool, str]:
    """Check if Docker CLI is available."""
    try:
        result = subprocess.run(
            ["docker", "--version"], capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, "Docker returned non-zero exit code"
    except FileNotFoundError:
        return False, "Docker is not installed or not in PATH"
    except Exception as e:
        return False, str(e)


def check_container(name: str) -> tuple[bool, str]:
    """Check if a specific container is running."""
    return _check_docker_container(name)


def check_backend_health() -> tuple[bool, str]:
    """Check the backend health endpoint."""
    status, data = _http_get(f"{BACKEND_URL}/health")
    if status == 200 and isinstance(data, dict) and data.get("status") == "ok":
        return True, f"Backend healthy (v{data.get('version', '?')}, uptime: {data.get('uptime_seconds', 0):.0f}s)"
    detail = str(data)[:200] if data else "no response"
    return False, f"Health check failed: HTTP {status}, {detail}"


def check_backend_providers() -> tuple[bool, str]:
    """Check backend provider registration."""
    status, data = _http_get(f"{BACKEND_URL}/health")
    if status == 200 and isinstance(data, dict):
        providers = data.get("providers", {})
        stt = providers.get("stt", [])
        llm = providers.get("llm", [])
        tts = providers.get("tts", [])
        summary = f"STT: {stt}, LLM: {llm}, TTS: {tts}"
        if stt and llm and tts:
            return True, summary
        return False, f"Missing providers: {summary}"
    return False, f"Could not fetch providers: HTTP {status}"


def check_redis() -> tuple[bool, str]:
    """Check if Redis is reachable."""
    if _check_tcp_port(REDIS_HOST, REDIS_PORT):
        return True, f"Redis port {REDIS_HOST}:{REDIS_PORT} is open"
    return False, f"Redis port {REDIS_HOST}:{REDIS_PORT} is not reachable"


def check_ollama() -> tuple[bool, str]:
    """Check if Ollama API is reachable and has models."""
    status, data = _http_get(f"{OLLAMA_URL}/api/tags")
    if status == 200:
        models = data.get("models", []) if isinstance(data, dict) else []
        count = len(models)
        if count > 0:
            names = [m.get("name", "?") for m in models[:5]]
            return True, f"Ollama running with {count} model(s): {', '.join(names)}"
        return True, "Ollama running but no models loaded"
    return False, f"Ollama API not reachable: HTTP {status}"


def check_esl_port() -> tuple[bool, str]:
    """Check if FreeSWITCH ESL port is open."""
    if _check_tcp_port(ESL_HOST, ESL_PORT):
        return True, f"ESL port {ESL_HOST}:{ESL_PORT} is open"
    return False, f"ESL port {ESL_HOST}:{ESL_PORT} is not reachable"


def check_sip_port() -> tuple[bool, str]:
    """Check if FreeSWITCH SIP port is open."""
    if _check_tcp_port(ESL_HOST, SIP_PORT):
        return True, f"SIP port {ESL_HOST}:{SIP_PORT} is open"
    return False, f"SIP port {ESL_HOST}:{SIP_PORT} is not reachable"


def check_freeswitch_health() -> tuple[bool, str]:
    """Check FreeSWITCH integration health via backend endpoint."""
    status, data = _http_get(f"{BACKEND_URL}/health/freeswitch")
    if status == 200 and isinstance(data, dict):
        fs_status = data.get("status", "error")
        esl = data.get("esl_connected", False)
        running = data.get("bridge_running", False)
        calls = data.get("active_calls", 0)
        if fs_status == "ok" and esl:
            return True, f"FreeSWITCH bridge running, {calls} active call(s)"
        elif fs_status == "stopped":
            return False, "FreeSWITCH bridge is stopped (not started or ESL disconnected)"
        return False, f"FreeSWITCH status: {fs_status}, ESL: {esl}, Bridge: {running}"
    return False, f"FreeSWITCH health check failed: {str(data)[:200]}"


def check_stt() -> tuple[bool, str]:
    """Check STT provider via health endpoint."""
    status, data = _http_get(f"{BACKEND_URL}/health/stt", timeout=30)
    if status == 200 and isinstance(data, dict):
        if data.get("status") == "ok":
            return True, f"STT ({data.get('provider', '?')}) ok in {data.get('transcription_ms', '?')}ms"
        return False, f"STT degraded: {data.get('check', '?')}"
    return False, f"STT check failed: {str(data)[:200]}"


def check_llm() -> tuple[bool, str]:
    """Check LLM provider via health endpoint."""
    status, data = _http_get(f"{BACKEND_URL}/health/llm", timeout=30)
    if status == 200 and isinstance(data, dict):
        if data.get("status") == "ok":
            return True, f"LLM ({data.get('provider', '?')}) responded: '{data.get('response', '')[:50]}'"
        return False, f"LLM degraded: {data.get('check', '?')}"
    return False, f"LLM check failed: {str(data)[:200]}"


def check_tts() -> tuple[bool, str]:
    """Check TTS provider via health endpoint."""
    status, data = _http_get(f"{BACKEND_URL}/health/tts", timeout=30)
    if status == 200 and isinstance(data, dict):
        if data.get("status") == "ok":
            audio_bytes = data.get("audio_bytes", 0)
            return True, f"TTS ({data.get('provider', '?')}) synthesized {audio_bytes} bytes"
        return False, f"TTS degraded: {data.get('check', '?')}"
    return False, f"TTS check failed: {str(data)[:200]}"


# ── Main ───────────────────────────────────────────────────────────

def main() -> int:
    """Run all validation checks and return exit code."""
    print(f"\n{_cyan(f'{TL}{H_LINE * 47}{TR}')}")
    print(f"{_cyan(V_LINE)}   Docker Stack Validation — {datetime.now().strftime('%H:%M:%S')}     {_cyan(V_LINE)}")
    print(f"{_cyan(f'{BL}{H_LINE * 47}{BR}')}")
    print(f"  {_yellow('Backend:')} {BACKEND_URL}")
    print(f"  {_yellow('Ollama:')}  {OLLAMA_URL}")
    print(f"  {_yellow('ESL:')}     {ESL_HOST}:{ESL_PORT}")
    print(f"  {_yellow('SIP:')}    {ESL_HOST}:{SIP_PORT}")
    print(f"  {_yellow('Redis:')} {REDIS_HOST}:{REDIS_PORT}")

    passed = 0
    failed = 0
    notes: list[str] = []

    # ── 1. Docker Installation ──
    _print_header("1. Docker Installation")
    ok, detail = check_docker_installed()
    if _print_result("Docker CLI", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Install Docker Desktop from https://docs.docker.com/desktop/install/windows-install/")

    # ── 2. Docker Containers ──
    _print_header("2. Docker Containers")
    for container in REQUIRED_CONTAINERS + FREESWITCH_CONTAINERS:
        ok, detail = check_container(container)
        is_required = container in REQUIRED_CONTAINERS
        name = f"{container} ({'required' if is_required else 'optional'})"
        if _print_result(name, ok, detail):
            passed += 1
        else:
            failed += 1
            if is_required:
                notes.append(f"Start required container: docker start {container}")

    # ── 3. Core Backend ──
    _print_header("3. Core Backend")
    ok, detail = check_backend_health()
    if _print_result("Backend health", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Ensure backend is running: cd backend && uvicorn app.main:app --port 8000")

    ok, detail = check_backend_providers()
    if _print_result("Providers registered", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Check provider registration logs")

    ok, detail = check_ollama()
    if _print_result("Ollama", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Start Ollama: ollama serve")

    ok, detail = check_redis()
    if _print_result("Redis", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Ensure Redis is running on port 6379")

    # ── 4. FreeSWITCH ──
    _print_header("4. FreeSWITCH Integration")
    ok, detail = check_esl_port()
    if _print_result("ESL port", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Ensure FreeSWITCH is running with ESL enabled on port 8021")

    ok, detail = check_sip_port()
    if _print_result("SIP port", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Ensure FreeSWITCH SIP profile is loaded on port 5060")

    ok, detail = check_freeswitch_health()
    if _print_result("FS bridge health", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("Ensure FreeSWITCH ESL bridge is connected (check backend logs)")

    # ── 5. AI Pipeline Providers ──
    _print_header("5. AI Pipeline Providers")
    ok, detail = check_stt()
    if _print_result("STT (Whisper)", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("STT provider not working: check whisper registration")

    ok, detail = check_llm()
    if _print_result("LLM (Ollama)", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("LLM provider not working: check Ollama and model availability")

    ok, detail = check_tts()
    if _print_result("TTS (Kokoro)", ok, detail):
        passed += 1
    else:
        failed += 1
        notes.append("TTS provider not working: check Kokoro registration")

    # ── Summary ──
    total = passed + failed
    print(f"\n{_cyan(H_LINE * 60)}")
    print(f"{_bold('  SUMMARY')}")
    print(f"{_cyan(H_LINE * 60)}")
    status_icon = STATUS_OK if failed == 0 else STATUS_FAIL
    print(f"  {status_icon}  {_green(str(passed))} passed, {_red(str(failed))} failed out of {total} checks")

    if failed == 0:
        print(f"\n  {_green('All checks passed! The stack is healthy.')}")
    else:
        print(f"\n  {_red(f'{failed} check(s) failed. Remediation:')}")
        for i, note in enumerate(notes, 1):
            print(f"    {i}. {_yellow(note)}")

    print("")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
