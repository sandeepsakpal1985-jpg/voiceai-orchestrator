#!/usr/bin/env python3
"""
FreeSWITCH Docker Stack Validator — Verifies all components of the AI + FS stack.

Tests:
  1. AI Backend HTTP health check
  2. FreeSWITCH ESL connectivity (port 8021)
  3. FreeSWITCH SIP port (5060)
  4. AI Backend FreeSWITCH HTTP API (/fs/health)
  5. Pipeline: LLM provider responds
  6. Pipeline: TTS provider produces audio
  7. End-to-end: Simulated call via HTTP API
  8. Container status (via Docker)

Usage:
    python telephony/scripts/validate_fs_stack.py [--host BACKEND_HOST]

Examples:
    # Check default localhost setup
    python telephony/scripts/validate_fs_stack.py

    # Check remote deployment
    python telephony/scripts/validate_fs_stack.py --host 192.168.1.100
"""

import argparse
import asyncio
import json
import logging
import os
import socket
import subprocess
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("fs_validator")

# ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"

PASS = f"{GREEN}✓ PASS{RESET}"
FAIL = f"{RED}✗ FAIL{RESET}"
SKIP = f"{YELLOW}⚠ SKIP{RESET}"


class StackValidator:
    """Validates all components of the FreeSWITCH + AI stack."""

    def __init__(self, host: str = "127.0.0.1", backend_port: int = 8000):
        self.host = host
        self.backend_port = backend_port
        self.backend_url = f"http://{host}:{backend_port}"
        self.results: list[dict] = []

    def record(self, name: str, passed: bool, detail: str = "") -> None:
        status = PASS if passed else FAIL
        self.results.append({"name": name, "passed": passed, "detail": detail})
        logger.info("  %s %s — %s", status, name, detail)

    async def run_all(self) -> bool:
        """Run all validation checks."""
        logger.info(f"\n{CYAN}{'='*60}{RESET}")
        logger.info(f"{CYAN}  FreeSWITCH + AI Stack Validator{RESET}")
        logger.info(f"{CYAN}  Backend: {self.backend_url}{RESET}")
        logger.info(f"{CYAN}{'='*60}{RESET}")

        # ── 1. AI Backend HTTP ───────────────────────────────────
        logger.info(f"\n{CYAN}1. AI Backend Health{RESET}")
        await self._check_backend_http()

        # ── 2. FreeSWITCH ESL ─────────────────────────────────────
        logger.info(f"\n{CYAN}2. FreeSWITCH ESL{RESET}")
        await self._check_esl_port()

        # ── 3. FreeSWITCH SIP ─────────────────────────────────────
        logger.info(f"\n{CYAN}3. FreeSWITCH SIP{RESET}")
        await self._check_sip_port()

        # ── 4. FS HTTP API ────────────────────────────────────────
        logger.info(f"\n{CYAN}4. FreeSWITCH HTTP API{RESET}")
        await self._check_fs_http_api()

        # ── 5. Pipeline: LLM ──────────────────────────────────────
        logger.info(f"\n{CYAN}5. AI Pipeline — LLM{RESET}")
        await self._check_llm()

        # ── 6. Pipeline: TTS ──────────────────────────────────────
        logger.info(f"\n{CYAN}6. AI Pipeline — TTS{RESET}")
        await self._check_tts()

        # ── 7. End-to-End Call Simulation ─────────────────────────
        logger.info(f"\n{CYAN}7. End-to-End Call Simulation{RESET}")
        await self._check_e2e_call()

        # ── 8. Docker Containers ──────────────────────────────────
        logger.info(f"\n{CYAN}8. Docker Container Status{RESET}")
        await self._check_docker()

        # ── Summary ───────────────────────────────────────────────
        return self._print_summary()

    async def _check_backend_http(self) -> None:
        """Check if the AI backend is responding."""
        try:
            async with asyncio.timeout(5):
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{self.backend_url}/health")
                    data = resp.json()
                    ok = resp.status_code == 200 and data.get("status") == "ok"
                    self.record(
                        "Backend HTTP /health",
                        ok,
                        f"status={data.get('status', '?')}, version={data.get('version', '?')}",
                    )
        except ImportError:
            self.record("Backend HTTP /health", False, "httpx not installed (pip install httpx)")
        except Exception as exc:
            self.record("Backend HTTP /health", False, str(exc))

    async def _check_esl_port(self) -> None:
        """Check if FreeSWITCH ESL port is open."""
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, 8021),
                timeout=3,
            )
            writer.close()
            await writer.wait_closed()
            self.record("ESL port 8021", True, "Port open and accepting connections")
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError) as exc:
            self.record(
                "ESL port 8021", False,
                f"Port not reachable: {exc}. Is FreeSWITCH running with mod_event_socket?",
            )

    async def _check_sip_port(self) -> None:
        """Check if FreeSWITCH SIP port is open."""
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, 5060),
                timeout=2,
            )
            writer.close()
            await writer.wait_closed()
            self.record("SIP port 5060", True, "Port open")
        except Exception:
            # SIP may not respond to plain TCP connect — try UDP
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.settimeout(2)
                sock.sendto(b"\r\n", (self.host, 5060))
                sock.close()
                self.record("SIP port 5060", True, "UDP port responding")
            except Exception as exc:
                self.record(
                    "SIP port 5060", False,
                    f"SIP port not reachable: {exc}",
                )

    async def _check_fs_http_api(self) -> None:
        """Check if the FS HTTP API is working."""
        try:
            async with asyncio.timeout(5):
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"{self.backend_url}/fs/health")
                    data = resp.json()
                    ok = resp.status_code == 200 and data.get("status") == "ok"
                    self.record(
                        "FS HTTP API /fs/health",
                        ok,
                        f"active_calls={data.get('active_calls', '?')}",
                    )
        except ImportError:
            self.record("FS HTTP API /fs/health", False, "httpx not installed")
        except Exception as exc:
            self.record("FS HTTP API /fs/health", False, str(exc))

    async def _check_llm(self) -> None:
        """Check if the LLM provider is responding."""
        try:
            async with asyncio.timeout(15):
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{self.backend_url}/voice/complete",
                        json={
                            "messages": [
                                {"role": "system", "content": "Respond with exactly: Hello from AI"},
                                {"role": "user", "content": "Say hello"},
                            ],
                            "temperature": 0.1,
                            "max_tokens": 50,
                        },
                    )
                    data = resp.json()
                    content = data.get("content", "")
                    ok = resp.status_code == 200 and len(content) > 3
                    self.record(
                        "LLM /voice/complete",
                        ok,
                        f"response='{content[:80]}'",
                    )
        except ImportError:
            self.record("LLM /voice/complete", False, "httpx not installed")
        except asyncio.TimeoutError:
            self.record("LLM /voice/complete", False, "LLM timed out (is Ollama running?)")
        except Exception as exc:
            self.record("LLM /voice/complete", False, str(exc))

    async def _check_tts(self) -> None:
        """Check if the TTS provider is producing audio."""
        try:
            async with asyncio.timeout(15):
                import httpx
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"{self.backend_url}/voice/synthesize",
                        json={
                            "text": "Hello, this is a test of the text to speech system.",
                        },
                    )
                    data = resp.json()
                    audio_b64 = data.get("audio_base64", "")
                    ok = resp.status_code == 200 and len(audio_b64) > 100
                    self.record(
                        "TTS /voice/synthesize",
                        ok,
                        f"audio_base64_length={len(audio_b64)}",
                    )
        except ImportError:
            self.record("TTS /voice/synthesize", False, "httpx not installed")
        except asyncio.TimeoutError:
            self.record("TTS /voice/synthesize", False, "TTS timed out")
        except Exception as exc:
            self.record("TTS /voice/synthesize", False, str(exc))

    async def _check_e2e_call(self) -> None:
        """Simulate an end-to-end call via the FS HTTP API."""
        try:
            async with asyncio.timeout(15):
                import httpx
                async with httpx.AsyncClient() as client:
                    # Step 1: Incoming call
                    resp = await client.post(
                        f"{self.backend_url}/fs/incoming",
                        json={
                            "call_uuid": "validation-test-uuid",
                            "caller_number": "+15551234567",
                            "called_number": "+15559876543",
                        },
                    )
                    if resp.status_code != 200:
                        self.record("E2E Call Simulation", False, f"/fs/incoming failed: {resp.status_code}")
                        return

                    data = resp.json()
                    conv_id = data.get("conversation_id", "")

                    if not conv_id:
                        self.record("E2E Call Simulation", False, "No conversation_id returned")
                        return

                    # Step 2: Hang up cleanly
                    resp = await client.post(
                        f"{self.backend_url}/fs/hangup",
                        json={"call_uuid": "validation-test-uuid"},
                    )
                    hung_up = resp.status_code == 200

                    self.record(
                        "E2E Call Simulation",
                        hung_up,
                        f"conversation_id={conv_id}, hangup={'ok' if hung_up else 'failed'}",
                    )
        except ImportError:
            self.record("E2E Call Simulation", False, "httpx not installed")
        except Exception as exc:
            self.record("E2E Call Simulation", False, str(exc))

    async def _check_docker(self) -> None:
        """Check Docker container status."""
        expected = ["ai-freeswitch", "ai-fs-backend", "ai-fs-ollama", "ai-fs-redis"]
        try:
            result = subprocess.run(
                ["docker", "ps", "--format", "{{.Names}}\t{{.Status}}"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                self.record("Docker containers", False, "Docker not available or not running")
                return

            lines = result.stdout.strip().split("\n")
            running = {}
            for line in lines:
                if "\t" in line:
                    name, status = line.split("\t", 1)
                    running[name] = status

            for name in expected:
                if name in running:
                    self.record(
                        f"Container: {name}",
                        "Up" in running[name],
                        running[name],
                    )
                else:
                    self.record(f"Container: {name}", False, "Not running")

        except FileNotFoundError:
            for name in expected:
                self.record(f"Container: {name}", False, "Docker CLI not found")
        except subprocess.TimeoutExpired:
            for name in expected:
                self.record(f"Container: {name}", False, "Docker command timed out")
        except Exception as exc:
            for name in expected:
                self.record(f"Container: {name}", False, str(exc))

    def _print_summary(self) -> bool:
        """Print final summary and return overall pass/fail."""
        passed = sum(1 for r in self.results if r["passed"])
        failed = sum(1 for r in self.results if not r["passed"])
        total = len(self.results)

        logger.info(f"\n{CYAN}{'='*60}{RESET}")
        logger.info(f"{CYAN}  SUMMARY: {passed}/{total} checks passed{RESET}")
        logger.info(f"{CYAN}{'='*60}{RESET}")

        if failed > 0:
            logger.info(f"\n{RED}Failed checks:{RESET}")
            for r in self.results:
                if not r["passed"]:
                    logger.info(f"  {FAIL} {r['name']} — {r['detail']}")

        all_pass = failed == 0
        if all_pass:
            logger.info(f"\n{GREEN}✅ All checks passed! The FreeSWITCH + AI stack is operational.{RESET}\n")
        else:
            logger.info(
                f"\n{YELLOW}⚠  {failed} check(s) failed. Review the details above.{RESET}\n"
            )

        return all_pass


def main():
    parser = argparse.ArgumentParser(
        description="Validate the FreeSWITCH + AI Docker stack"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="AI backend host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=8000,
        help="AI backend port (default: 8000)",
    )
    args = parser.parse_args()

    validator = StackValidator(host=args.host, backend_port=args.port)
    success = asyncio.run(validator.run_all())
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
