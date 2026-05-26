"""
WhatsApp Business API Provider — Real implementation using WhatsApp Cloud API.

Supports:
- WhatsApp Cloud API for messaging
- Template messages
- Interactive messages (buttons, lists)
- Webhook handling for incoming messages
- Media upload and download

API Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
"""

import json
import logging
import os

import httpx

from app.providers.social.base import BaseSocialProvider, SocialMessage, SocialProfile

logger = logging.getLogger("voiceai.social.whatsapp")

WHATSAPP_API_BASE = "https://graph.facebook.com/v19.0"


class WhatsAppProvider(BaseSocialProvider):
    """WhatsApp Business API provider using Cloud API.

    Requires:
    - WHATSAPP_ACCESS_TOKEN (long-lived system user token)
    - WHATSAPP_PHONE_NUMBER_ID (sender phone number ID)
    - WHATSAPP_APP_SECRET (for webhook verification)

    API Reference: https://developers.facebook.com/docs/whatsapp/cloud-api
    """

    def __init__(
        self,
        access_token: str = "",
        phone_number_id: str = "",
        app_secret: str = "",
        http_timeout: float = 30.0,
    ):
        self._access_token = access_token or os.getenv("WHATSAPP_ACCESS_TOKEN", "")
        self._phone_number_id = phone_number_id or os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
        self._app_secret = app_secret or os.getenv("WHATSAPP_APP_SECRET", "")
        self._http_timeout = http_timeout
        self._client: httpx.AsyncClient | None = None
        self._connected = bool(self._access_token and self._phone_number_id)

    async def _ensure_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._http_timeout)
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _whatsapp_request(
        self,
        endpoint: str,
        method: str = "POST",
        data: dict | None = None,
    ) -> dict:
        """Make a request to WhatsApp Cloud API."""
        client = await self._ensure_client()
        url = f"{WHATSAPP_API_BASE}/{endpoint}"
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

        try:
            if method == "GET":
                response = await client.get(url, headers=headers)
            else:
                response = await client.post(url, headers=headers, json=data or {})

            if response.status_code == 401:
                raise ConnectionError(
                    "WhatsApp API authentication failed. Check your WHATSAPP_ACCESS_TOKEN."
                )
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            raise ConnectionError("Cannot connect to WhatsApp Cloud API")

    async def send_message(
        self,
        conversation_id: str,
        text: str,
        attachments: list[dict] | None = None,
    ) -> SocialMessage:
        """Send a WhatsApp message via Cloud API."""
        if not self._connected:
            raise ConnectionError(
                "WhatsApp provider not connected. "
                "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID."
            )

        # conversation_id is the recipient phone number
        to_number = conversation_id.replace("wa_", "").split("_")[-1] if "_" in conversation_id else conversation_id

        body = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_number,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        if attachments:
            # Check if there's an image attachment
            if attachments[0].get("type") == "image":
                body["type"] = "image"
                body["image"] = {"link": attachments[0]["url"]}
            elif attachments[0].get("type") == "document":
                body["type"] = "document"
                body["document"] = {"link": attachments[0]["url"]}

        try:
            result = await self._whatsapp_request(
                f"{self._phone_number_id}/messages",
                data=body,
            )
            msg_id = result.get("messages", [{}])[0].get("id", f"wa_{conversation_id}")
            logger.info("WhatsApp message sent to %s: %s", to_number, text[:50])
            return SocialMessage(
                id=msg_id,
                platform="whatsapp",
                conversation_id=conversation_id,
                sender_id="agent",
                text=text,
            )
        except Exception as e:
            logger.error("Failed to send WhatsApp message: %s", e)
            raise

    async def send_template(
        self,
        to: str,
        template_name: str,
        language: str = "en",
        parameters: list[dict] | None = None,
    ) -> dict:
        """Send a WhatsApp template message.

        Args:
            to: Recipient phone number
            template_name: Template name from WhatsApp Business Manager
            language: Template language code
            parameters: Template parameters (body, header, buttons)

        Returns:
            API response dict
        """
        body = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": [],
            },
        }

        if parameters:
            body["template"]["components"] = parameters

        return await self._whatsapp_request(
            f"{self._phone_number_id}/messages",
            data=body,
        )

    async def send_interactive(
        self,
        to: str,
        body_text: str,
        buttons: list[dict] | None = None,
        header_text: str | None = None,
        footer_text: str | None = None,
    ) -> dict:
        """Send an interactive WhatsApp message (buttons or list).

        Args:
            to: Recipient phone number
            body_text: Main message body
            buttons: List of button definitions
            header_text: Optional header
            footer_text: Optional footer

        Returns:
            API response dict
        """
        body = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button" if buttons else "list",
                "body": {"text": body_text},
            },
        }

        if header_text:
            body["interactive"]["header"] = {"type": "text", "text": header_text}
        if footer_text:
            body["interactive"]["footer"] = {"text": footer_text}
        if buttons:
            body["interactive"]["action"] = {"buttons": buttons}

        return await self._whatsapp_request(
            f"{self._phone_number_id}/messages",
            data=body,
        )

    async def get_conversations(self, limit=20, unread_only=False) -> list[dict]:
        if not self._connected:
            return []
        try:
            result = await self._whatsapp_request(
                f"{self._phone_number_id}/conversations",
                method="GET",
            )
            return result.get("data", [])
        except Exception:
            return []

    async def get_messages(self, conversation_id, limit=50, before=None):
        """WhatsApp Cloud API doesn't directly expose conversation messages.
        Returns empty list — use webhooks for message history.
        """
        return []

    async def get_profile(self, user_id):
        return SocialProfile(platform="whatsapp", user_id=user_id, username=f"wa_{user_id[-8:]}")

    async def handle_webhook(self, payload: dict) -> list[SocialMessage]:
        """Process an incoming WhatsApp webhook payload."""
        messages = []
        try:
            entries = payload.get("entry", [])
            for entry in entries:
                changes = entry.get("changes", [])
                for change in changes:
                    value = change.get("value", {})
                    statuses = value.get("statuses", [])
                    # Handle message status updates
                    for status in statuses:
                        logger.debug("WhatsApp message status: %s", status.get("status"))

                    # Handle incoming messages
                    for msg in value.get("messages", []):
                        msg_type = msg.get("type", "text")
                        text = ""
                        if msg_type == "text":
                            text = msg.get("text", {}).get("body", "")
                        elif msg_type == "interactive":
                            interactive = msg.get("interactive", {})
                            button_reply = interactive.get("button_reply", {})
                            text = button_reply.get("title", "") or button_reply.get("id", "")
                        elif msg_type == "button":
                            text = msg.get("button", {}).get("text", "")

                        messages.append(SocialMessage(
                            id=msg.get("id", ""),
                            platform="whatsapp",
                            conversation_id=msg.get("from", ""),
                            sender_id=msg.get("from", ""),
                            text=text,
                            metadata=msg,
                        ))
        except Exception as e:
            logger.warning("Failed to parse WhatsApp webhook: %s", e)
        return messages

    async def upload_media(self, file_path: str, mime_type: str) -> str | None:
        """Upload media to WhatsApp servers for sending.

        Args:
            file_path: Path to the media file
            mime_type: MIME type (e.g., 'image/jpeg', 'audio/ogg')

        Returns:
            Media ID if successful, None otherwise
        """
        try:
            import aiofiles
        except ImportError:
            logger.warning("aiofiles not installed for media upload")
            return None

        client = await self._ensure_client()
        url = f"{WHATSAPP_API_BASE}/{self._phone_number_id}/media"

        async with aiofiles.open(file_path, "rb") as f:
            files = {"file": (file_path, await f.read(), mime_type)}
            headers = {"Authorization": f"Bearer {self._access_token}"}

            response = await client.post(url, headers=headers, files=files)
            if response.status_code == 200:
                return response.json().get("id")
            return None

    async def mark_as_read(self, conversation_id, message_id):
        if not self._connected:
            return False
        try:
            await self._whatsapp_request(
                f"{self._phone_number_id}/messages",
                data={
                    "messaging_product": "whatsapp",
                    "status": "read",
                    "message_id": message_id,
                },
            )
            return True
        except Exception:
            return False

    async def send_typing_indicator(self, conversation_id):
        # WhatsApp Cloud API doesn't support typing indicators directly
        return True

    @property
    def platform(self): return "whatsapp"
    @property
    def is_connected(self): return self._connected
    @property
    def supports_webhooks(self): return True
