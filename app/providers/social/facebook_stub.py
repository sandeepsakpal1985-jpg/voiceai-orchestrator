"""Facebook Messenger Automation Provider — Stub implementation."""

import logging
from app.providers.social.base import BaseSocialProvider, SocialMessage, SocialProfile

logger = logging.getLogger("voiceai.social.facebook")


class FacebookProvider(BaseSocialProvider):
    """Facebook Messenger automation provider.

    TODO: Implement full Facebook Graph API integration.
    - Messenger Platform API for DM automation
    - Page conversations
    - Lead ads processing
    - Comment automation
    """

    def __init__(self, access_token: str = "", page_id: str = ""):
        self._access_token = access_token
        self._page_id = page_id
        self._connected = bool(access_token and page_id)

    async def send_message(self, conversation_id: str, text: str, attachments=None):
        if not self._connected:
            raise ConnectionError("Facebook provider not connected.")
        logger.info("Facebook message sent to %s: %s", conversation_id, text[:50])
        return SocialMessage(id=f"fb_msg_{conversation_id}", platform="facebook",
                             conversation_id=conversation_id, sender_id="agent", text=text)

    async def get_conversations(self, limit=20, unread_only=False):
        return []

    async def get_messages(self, conversation_id, limit=50, before=None):
        return []

    async def get_profile(self, user_id):
        return SocialProfile(platform="facebook", user_id=user_id, username=f"fb_user_{user_id[:8]}")

    async def handle_webhook(self, payload):
        logger.info("Facebook webhook received")
        return []

    async def mark_as_read(self, conversation_id, message_id):
        return self._connected

    async def send_typing_indicator(self, conversation_id):
        return self._connected

    @property
    def platform(self): return "facebook"
    @property
    def is_connected(self): return self._connected
    @property
    def supports_webhooks(self): return True
