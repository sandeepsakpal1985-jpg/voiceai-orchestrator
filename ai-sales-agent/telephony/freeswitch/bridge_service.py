"""
FreeSWITCH Bridge Service — Main orchestrator for the FreeSWITCH <-> AI pipeline integration.

Responsibilities:
  - Connects to FreeSWITCH ESL and manages the connection lifecycle
  - Subscribes to call events (CHANNEL_ANSWER, CHANNEL_HANGUP, etc.)
  - Creates CallHandler instances for each inbound call
  - Manages active calls and handles cleanup
  - Provides health and status reporting

This runs as a background task within the FastAPI application lifecycle.
"""

import asyncio
import logging
import os
import time
from typing import Any

from .call_handler import FreeSwitchCallHandler
from .config import get_freeswitch_settings
from .esl_client import ESLClient
from .exceptions import BridgeServiceError, ESLConnectionError
from .types import CallDirection, CallState, FreeswitchCall

logger = logging.getLogger("ai_sales_agent.freeswitch.bridge")


class FreeSwitchBridgeService:
    """Orchestrates FreeSWITCH call handling through the AI voice pipeline."""

    def __init__(self) -> None:
        self._settings = get_freeswitch_settings()
        self._esl: ESLClient | None = None
        self._active_calls: dict[str, FreeswitchCall] = {}
        self._handlers: dict[str, FreeSwitchCallHandler] = {}
        self._connection_task: asyncio.Task | None = None
        self._keepalive_task: asyncio.Task | None = None
        self._cleanup_task: asyncio.Task | None = None
        self._started = False
        self._retry_count = 0

    @property
    def is_running(self) -> bool:
        return self._started

    @property
    def esl_connected(self) -> bool:
        return self._esl is not None and self._esl.is_connected

    @property
    def active_call_count(self) -> int:
        return len(self._active_calls)

    @property
    def active_calls(self) -> list[dict[str, Any]]:
        return [
            c.summary for c in self._active_calls.values() if c.is_active
        ]

    async def start(self) -> None:
        """Start the bridge service: connect ESL, register handlers, start loops."""
        if self._started:
            logger.warning("FreeSWITCH bridge already running")
            return

        logger.info("STAGE[FS BRIDGE START] Starting FreeSWITCH bridge service...")

        # Ensure audio directory exists
        os.makedirs(self._settings.FREESWITCH_AUDIO_DIR, exist_ok=True)

        # Start connection attempt in the background (with retries)
        self._connection_task = asyncio.create_task(self._connect_with_retry())
        self._started = True
        logger.info("STAGE[FS BRIDGE STARTED] FreeSWITCH bridge service started")

    async def stop(self) -> None:
        """Stop the bridge service: disconnect ESL, hang up calls, cancel tasks."""
        logger.info("STAGE[FS BRIDGE STOP] Stopping FreeSWITCH bridge service...")
        self._started = False

        # Cancel all background tasks
        for task_name, task in [
            ("connection", self._connection_task),
            ("keepalive", self._keepalive_task),
            ("cleanup", self._cleanup_task),
        ]:
            if task:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

        # Stop all active call handlers
        for call_uuid, handler in list(self._handlers.items()):
            try:
                await handler.stop()
            except Exception:
                logger.exception("Error stopping handler for call %s", call_uuid)

        self._active_calls.clear()
        self._handlers.clear()

        # Disconnect ESL
        if self._esl:
            try:
                await self._esl.disconnect()
            except Exception:
                pass
            self._esl = None

        logger.info("STAGE[FS BRIDGE STOPPED] FreeSWITCH bridge service stopped")

    async def get_stats(self) -> dict[str, Any]:
        """Get bridge service statistics."""
        active = [c.summary for c in self._active_calls.values() if c.is_active]
        completed = [c.summary for c in self._active_calls.values() if not c.is_active]
        return {
            "connected": self.esl_connected,
            "running": self._started,
            "active_calls": len(active),
            "total_calls_tracked": len(self._active_calls),
            "active_call_summaries": active[-5:],
            "recent_completed": completed[-5:],
            "retry_count": self._retry_count,
        }

    async def initiate_outbound_call(
        self,
        to_number: str,
        from_number: str | None = None,
    ) -> str:
        """Initiate an outbound call through FreeSWITCH.

        Args:
            to_number: Destination phone number.
            from_number: Source phone number (defaults to gateway).

        Returns:
            Call UUID if the call was initiated, or raises on failure.
        """
        if not self.esl_connected:
            raise BridgeServiceError("ESL not connected, cannot initiate outbound call")

        from_number = from_number or self._settings.FREESWITCH_SIP_IP
        originate_cmd = (
            f"originate {{origination_caller_id_number={from_number}}}"
            f"sofia/internal/{to_number}@{self._settings.FREESWITCH_SIP_IP}:{self._settings.FREESWITCH_SIP_PORT}"
            f" &park()"
        )
        resp = await self._esl.send_command(originate_cmd)
        if not resp.success:
            raise BridgeServiceError(f"Originate failed: {resp.body}")

        call_uuid = resp.body.strip()
        logger.info("Outbound call initiated: %s -> %s (UUID: %s)", from_number, to_number, call_uuid)
        return call_uuid

    # ── Internal Methods ────────────────────────────────────────────

    async def _connect_with_retry(self) -> None:
        """Connect to FreeSWITCH ESL with automatic retries."""
        while self._started:
            try:
                self._esl = ESLClient(
                    host=self._settings.FREESWITCH_ESL_HOST,
                    port=self._settings.FREESWITCH_ESL_PORT,
                    password=self._settings.FREESWITCH_ESL_PASSWORD,
                    timeout=self._settings.FREESWITCH_ESL_TIMEOUT,
                )
                await self._esl.connect()
                self._retry_count = 0

                # Subscribe to call events
                await self._esl.subscribe(
                    "CHANNEL_ANSWER CHANNEL_HANGUP "
                    "CHANNEL_CREATE CHANNEL_BRIDGE "
                    "CHANNEL_DESTROY DTMF RECORD_STOP"
                )
                logger.info("FreeSWITCH ESL event subscription active")

                # Register event handlers
                self._esl.on_event("CHANNEL_ANSWER", self._on_channel_answer)
                self._esl.on_event("CHANNEL_HANGUP", self._on_channel_hangup)
                self._esl.on_event("CHANNEL_CREATE", self._on_channel_create)
                self._esl.on_event("CHANNEL_DESTROY", self._on_channel_destroy)
                self._esl.on_event("DTMF", self._on_dtmf)
                self._esl.on_raw(self._on_raw_event)

                # Start event listener
                await self._esl.listen()

                # Start keepalive ping
                self._keepalive_task = asyncio.create_task(self._keepalive_loop())
                # Start periodic cleanup
                self._cleanup_task = asyncio.create_task(self._cleanup_loop())

                logger.info(
                    "FreeSWITCH bridge connected to ESL at %s",
                    self._settings.esl_address,
                )
                return  # Connected successfully

            except ESLConnectionError:
                self._retry_count += 1
                if self._retry_count <= self._settings.FREESWITCH_BRIDGE_MAX_RETRIES:
                    logger.warning(
                        "ESL connection attempt %d/%d failed, retrying in %ds...",
                        self._retry_count,
                        self._settings.FREESWITCH_BRIDGE_MAX_RETRIES,
                        self._settings.FREESWITCH_BRIDGE_RECONNECT_DELAY,
                    )
                    await asyncio.sleep(
                        self._settings.FREESWITCH_BRIDGE_RECONNECT_DELAY
                    )
                else:
                    logger.error(
                        "ESL connection failed after %d retries. Bridge disabled.",
                        self._retry_count,
                    )
                    break
            except Exception:
                logger.exception("Unexpected error connecting to FreeSWITCH ESL")
                await asyncio.sleep(
                    self._settings.FREESWITCH_BRIDGE_RECONNECT_DELAY
                )

    async def _keepalive_loop(self) -> None:
        """Periodically ping ESL to keep the connection alive."""
        while self._started and self.esl_connected:
            await asyncio.sleep(30)
            try:
                if self._esl and self._esl.is_connected:
                    await self._esl.send_command("status")
            except Exception:
                logger.warning("ESL keepalive ping failed, reconnecting...")
                break

    async def _cleanup_loop(self) -> None:
        """Periodically clean up stale/completed calls."""
        while self._started:
            await asyncio.sleep(60)
            stale_uuids = []
            for call_uuid, call in self._active_calls.items():
                if not call.is_active or call.state == CallState.FAILED:
                    stale_uuids.append(call_uuid)
                elif call.duration > self._settings.FREESWITCH_MAX_CALL_DURATION:
                    logger.info("Call %s exceeded max duration, terminating", call_uuid)
                    stale_uuids.append(call_uuid)

            for uuid in stale_uuids:
                await self._remove_call(uuid)

            if stale_uuids:
                logger.info("Cleaned up %d stale calls", len(stale_uuids))

    # ── Event Handlers ──────────────────────────────────────────────

    async def _on_channel_create(self, event: dict) -> None:
        """Handle CHANNEL_CREATE event — track the call."""
        call_uuid = event.get("Unique-ID", "")
        caller = event.get("Caller-Caller-ID-Number", event.get("Caller-Username", "unknown"))
        called = event.get("Caller-Dialplan", "unknown")

        if not call_uuid:
            return

        # Avoid duplicate tracking
        if call_uuid in self._active_calls:
            return

        call = FreeswitchCall(
            call_uuid=call_uuid,
            caller_number=caller,
            called_number=called,
            direction=CallDirection.INBOUND,
            state=CallState.RINGING,
            started_at=time.time(),
            sip_call_id=event.get("Caller-Unique-ID", ""),
            metadata={
                "caller_destination": event.get("Caller-Destination-Number", ""),
                "context": event.get("Caller-Context", ""),
                "network_addr": event.get("Caller-Network-Addr", ""),
            },
        )
        self._active_calls[call_uuid] = call
        logger.info("[SIP REGISTER] Call %s: Channel created (caller: %s, called: %s)", call_uuid, caller, called)
        logger.info("[CALL RECEIVED] Call %s: Incoming from %s -> %s", call_uuid, caller, called)

    async def _on_channel_answer(self, event: dict) -> None:
        """Handle CHANNEL_ANSWER event — start AI conversation."""
        call_uuid = event.get("Unique-ID", "")
        call = self._active_calls.get(call_uuid)

        if not call:
            # Call wasn't tracked yet (e.g., missed CHANNEL_CREATE)
            caller = event.get("Caller-Caller-ID-Number", "unknown")
            called = event.get("Caller-Dialplan", "unknown")
            call = FreeswitchCall(
                call_uuid=call_uuid,
                caller_number=caller,
                called_number=called,
                direction=CallDirection.INBOUND,
                started_at=time.time(),
                sip_call_id=event.get("Caller-Unique-ID", ""),
            )
            self._active_calls[call_uuid] = call

        call.mark_answered()
        logger.info(
            "[CALL ANSWERED] Call %s: Answered, starting AI conversation",
            call_uuid,
        )

        # Create and start the call handler
        handler = FreeSwitchCallHandler(
            call=call,
            esl_client=self._esl,
            audio_dir=self._settings.FREESWITCH_AUDIO_DIR,
            greeting=self._settings.FREESWITCH_GREETING,
            llm_timeout=self._settings.FREESWITCH_LLM_TIMEOUT,
            max_turns=self._settings.FREESWITCH_MAX_TURNS,
        )
        self._handlers[call_uuid] = handler
        asyncio.create_task(handler.start())

    async def _on_channel_hangup(self, event: dict) -> None:
        """Handle CHANNEL_HANGUP event — clean up call."""
        call_uuid = event.get("Unique-ID", "")
        logger.info("[CALL ENDED] Call %s: Hangup event received", call_uuid)
        await self._remove_call(call_uuid)

    async def _on_channel_destroy(self, event: dict) -> None:
        """Handle CHANNEL_DESTROY event — final cleanup."""
        call_uuid = event.get("Unique-ID", "")
        await self._remove_call(call_uuid)

    async def _on_dtmf(self, event: dict) -> None:
        """Handle DTMF digit presses during calls.

        DTMF events carry the pressed digit and the call UUID.
        Digits can be used for menu navigation (e.g., 'Press 1 for sales').
        Currently logs detected digits for auditing and debugging.
        """
        call_uuid = event.get("Unique-ID", "")
        digit = event.get("DTMF-Digit", event.get("dtmf-digit", "?"))
        duration = event.get("DTMF-Duration", "")

        if not call_uuid or digit == "?":
            return

        logger.info(
            "DTMF[call=%s] Digit '%s' pressed (duration: %sms)",
            call_uuid, digit, duration,
        )

        # Store last DTMF digit on the call for potential menu routing
        call = self._active_calls.get(call_uuid)
        if call:
            call.metadata["last_dtmf"] = digit
            dtmf_history = call.metadata.get("dtmf_history", [])
            dtmf_history.append({
                "digit": digit,
                "duration_ms": duration,
                "timestamp": time.time(),
            })
            call.metadata["dtmf_history"] = dtmf_history[-20:]  # Keep last 20 digits

        # Route special DTMF sequences
        if digit == "0":
            logger.info("DTMF[call=%s] Operator request detected (digit 0)", call_uuid)
            call.metadata["dtmf_action"] = "operator"
        elif digit == "*":
            logger.info("DTMF[call=%s] Menu restart detected (digit *)", call_uuid)
            call.metadata["dtmf_action"] = "restart_menu"

    async def _on_raw_event(self, event: dict) -> None:
        """Handle raw/unfiltered events for debugging."""
        event_name = event.get("Event-Name", "")
        if event_name in ("CHANNEL_CREATE", "CHANNEL_ANSWER", "CHANNEL_HANGUP", "CHANNEL_DESTROY", "DTMF"):
            return  # Already handled by specific handlers
        # Log other events at debug level
        logger.debug("FS event: %s (call: %s)", event_name, event.get("Unique-ID", "?"))

    async def _remove_call(self, call_uuid: str) -> None:
        """Remove a call and its handler from tracking.

        Args:
            call_uuid: UUID of the call to remove.
        """
        # Stop handler if active
        handler = self._handlers.pop(call_uuid, None)
        if handler:
            try:
                await handler.stop()
            except Exception:
                pass

        # Mark call as completed
        call = self._active_calls.get(call_uuid)
        if call:
            call.mark_completed()
            logger.info(
                "STAGE[CALL CLEANUP] Call %s: Marked completed (%.1fs, %d turns)",
                call_uuid, call.duration, call.turn_count,
            )

        logger.info("Call %s: Removed from bridge tracking", call_uuid)


# ── Singleton ──

_bridge: FreeSwitchBridgeService | None = None


def get_freeswitch_bridge() -> FreeSwitchBridgeService:
    """Get the singleton FreeSWITCH bridge service."""
    global _bridge
    if _bridge is None:
        _bridge = FreeSwitchBridgeService()
    return _bridge


def reset_freeswitch_bridge() -> None:
    """Reset the singleton for testing."""
    global _bridge
    _bridge = None
