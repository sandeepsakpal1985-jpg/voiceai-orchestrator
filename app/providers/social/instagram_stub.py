"""Instagram DM Automation Provider — Stub implementation.

Ready for integration with Instagram Graph API when credentials are configured.
"""

import logging
from typing import Optional

from app.providers.social.base import BaseSocialProvider, SocialMessage, SocialProfile

logger = logging.getLogger("voiceai.social.instagram")


class InstagramProvider(BaseSocialProvider):
    """Instagram DM automation provider.

    TODO: Implement full Instagram Graph API integration.
    - Instagram Messaging API for DM automation
    - Comment reply automation
    - Story mention handling
    - Lead capture from DMs
    """

    def __init__(self, access_token: str = "", business_id: str = ""):
        self._access_token = access_token
        self._business_id = business_id
        self._connected = bool(access_token and business_id)

    async def send_message(
        self,
        conversation_id: str,
        text: str,
        attachments: list[dict] | None = None,
    ) -> SocialMessage:
        if not self._connected:
            raise ConnectionError("Instagram provider not connected. Set access_token and business_id.")
        logger.info("Instagram DM sent to %s: %s", conversation_id, text[:50])
        return SocialMessage(
            id=f"ig_msg_stub_{conversation_id}",
            platform="instagram",
            conversation_id=conversation_id,
            sender_id="agent",
            text=text,
        )

    async def get_conversations(self, limit: int = 20, unread_only: bool = False) -> list[dict]:
        if not self._connected:
            return []
        logger.debug("Instagram: fetching %d conversations (unread=%s)", limit, unread_only)
        return []  # TODO: Graph API call

    async def get_messages(
        self, conversation_id: str, limit: int = 50, before: str | None = None
    ) -> list[SocialMessage]:
        return []

    async def get_profile(self, user_id: str) -> SocialProfile:
        return SocialProfile(
            platform="instagram",
            user_id=user_id,
            username=f"user_{user_id[:8]}",
        )

    async def handle_webhook(self, payload: dict) -> list[SocialMessage]:
        logger.info("Instagram webhook received: %s", str(payload)[:100])
        return []  # TODO: Parse Instagram webhook payload

    async def mark_as_read(self, conversation_id: str, message_id: str) -> bool:
        return self._connected

    async def send_typing_indicator(self, conversation_id: str) -> bool:
        return self._connected

    @property
    def platform(self) -> str:
        return "instagram"

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def supports_webhooks(self) -> bool:
        return True
