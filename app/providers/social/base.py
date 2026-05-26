"""Social Automation Provider Abstraction — Abstract Base Classes

Supports pluggable social media providers for:
- Instagram DM automation
- Facebook Messenger automation
- WhatsApp Business API automation

All providers follow the same interface for sending messages,
receiving messages, and managing conversations.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SocialMessage:
    """A message from a social platform."""
    id: str
    platform: str  # "instagram", "facebook", "whatsapp"
    conversation_id: str
    sender_id: str
    sender_name: str | None = None
    text: str = ""
    timestamp: float = 0.0
    attachments: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class SocialProfile:
    """A social media user profile."""
    platform: str
    user_id: str
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    metadata: dict = field(default_factory=dict)


class BaseSocialProvider(ABC):
    """Base class for social media automation providers.

    Implementations handle authentication, messaging, webhooks,
    and lead capture for each platform.
    """

    @abstractmethod
    async def send_message(
        self,
        conversation_id: str,
        text: str,
        attachments: list[dict] | None = None,
    ) -> SocialMessage:
        """Send a message to a conversation."""
        ...

    @abstractmethod
    async def get_conversations(
        self,
        limit: int = 20,
        unread_only: bool = False,
    ) -> list[dict]:
        """Fetch recent conversations."""
        ...

    @abstractmethod
    async def get_messages(
        self,
        conversation_id: str,
        limit: int = 50,
        before: str | None = None,
    ) -> list[SocialMessage]:
        """Fetch messages from a conversation."""
        ...

    @abstractmethod
    async def get_profile(self, user_id: str) -> SocialProfile:
        """Fetch a user's profile information."""
        ...

    @abstractmethod
    async def handle_webhook(self, payload: dict) -> list[SocialMessage]:
        """Process an incoming webhook payload and return parsed messages."""
        ...

    @abstractmethod
    async def mark_as_read(self, conversation_id: str, message_id: str) -> bool:
        """Mark a message as read."""
        ...

    @abstractmethod
    async def send_typing_indicator(self, conversation_id: str) -> bool:
        """Send a typing indicator to show the agent is responding."""
        ...

    @property
    @abstractmethod
    def platform(self) -> str:
        """Platform name: 'instagram', 'facebook', 'whatsapp'."""
        ...

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Whether the provider has valid authentication."""
        ...

    @property
    @abstractmethod
    def supports_webhooks(self) -> bool:
        """Whether this provider supports incoming webhooks."""
        ...
