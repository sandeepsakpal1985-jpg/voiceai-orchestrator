"""WhatsApp Business API Provider — Stub implementation."""

import logging
from app.providers.social.base import BaseSocialProvider, SocialMessage, SocialProfile

logger = logging.getLogger("voiceai.social.whatsapp")


class WhatsAppProvider(BaseSocialProvider):
    """WhatsApp Business API automation provider.

    TODO: Implement full WhatsApp Business API integration.
    - Cloud API for messaging
    - Template messages
    - Interactive messages (buttons, lists)
    - Webhook handling for incoming messages
    """

    def __init__(self, access_token: str = "", phone_number_id: str = ""):
        self._access_token = access_token
        self._phone_number_id = phone_number_id
        self._connected = bool(access_token and phone_number_id)

    async def send_message(self, conversation_id: str, text: str, attachments=None):
        if not self._connected:
            raise ConnectionError("WhatsApp provider not connected.")
        logger.info("WhatsApp message sent to %s: %s", conversation_id, text[:50])
        return SocialMessage(id=f"wa_msg_{conversation_id}", platform="whatsapp",
                             conversation_id=conversation_id, sender_id="agent", text=text)

    async def get_conversations(self, limit=20, unread_only=False):
        return []

    async def get_messages(self, conversation_id, limit=50, before=None):
        return []

    async def get_profile(self, user_id):
        return SocialProfile(platform="whatsapp", user_id=user_id, username=f"wa_{user_id[:8]}")

    async def handle_webhook(self, payload):
        logger.info("WhatsApp webhook received")
        return []

    async def mark_as_read(self, conversation_id, message_id):
        return self._connected

    async def send_typing_indicator(self, conversation_id):
        return self._connected

    @property
    def platform(self): return "whatsapp"
    @property
    def is_connected(self): return self._connected
    @property
    def supports_webhooks(self): return True
