"""
CRM Tools — Example tools for customer relationship management integration.

These tools are registered with the ToolRegistry and can be called
by the LLM during conversations to perform CRM operations.

Tools:
    - lookup_contact: Find a contact by name or phone
    - get_contact_history: Get conversation history for a contact
    - update_contact_notes: Add notes to a contact record
"""

import logging

from app.tools.base import ToolDefinition, ToolResult, get_tool_registry

logger = logging.getLogger("voiceai.tools.crm")


async def lookup_contact(name: str = "", phone: str = "") -> str:
    """Look up a contact in the CRM by name or phone number.

    Args:
        name: Contact name to search for
        phone: Phone number to search for

    Returns:
        Contact information as a formatted string
    """
    try:
        from app.services.conversation import get_conversation_service

        conv_service = get_conversation_service()
        contacts = conv_service.list_by_contact(
            contact_phone=phone if phone else None,
            contact_name=name if name else None,
        )

        if not contacts:
            return f"No contact found matching name='{name}' phone='{phone}'"

        # Deduplicate by contact info
        seen = set()
        results = []
        for c in contacts:
            key = (c.contact_phone or "", c.contact_name or "")
            if key not in seen:
                seen.add(key)
                results.append(
                    f"- {c.contact_name or 'Unknown'}"
                    f" ({c.contact_phone or 'No phone'})"
                    f" — {len(getattr(c, 'messages', []) or [])} conversations"
                )

        return "Contacts found:\n" + "\n".join(results[:5])

    except Exception as e:
        logger.warning("CRM lookup error: %s", e)
        return f"CRM lookup unavailable: {e}"


async def get_contact_history(contact_phone: str, limit: int = 5) -> str:
    """Get recent conversation history for a contact.

    Args:
        contact_phone: Phone number of the contact
        limit: Maximum number of conversations to return

    Returns:
        Recent conversation summary
    """
    try:
        from app.services.conversation import get_conversation_service

        conv_service = get_conversation_service()
        conversations = conv_service.list_by_contact(
            contact_phone=contact_phone,
            limit=limit,
        )

        if not conversations:
            return f"No conversation history found for {contact_phone}"

        summaries = []
        for c in conversations[:limit]:
            sentiment = getattr(c, "sentiment_label", "neutral")
            messages = getattr(c, "messages", []) or []
            summaries.append(
                f"- Conversation {c.id[:8]}... "
                f"({len(messages)} messages, sentiment: {sentiment})"
            )

        return f"Recent conversations for {contact_phone}:\n" + "\n".join(summaries)

    except Exception as e:
        logger.warning("History lookup error: %s", e)
        return f"History unavailable: {e}"


async def update_contact_notes(contact_phone: str, notes: str) -> str:
    """Add notes to a contact record.

    Args:
        contact_phone: Phone number of the contact
        notes: Notes to add

    Returns:
        Confirmation message
    """
    # Placeholder — real implementation would update a CRM database
    logger.info("CRM notes update for %s: %s", contact_phone, notes[:100])
    return f"Notes added to contact {contact_phone}"


def register_crm_tools() -> None:
    """Register all CRM tools with the global tool registry."""
    registry = get_tool_registry()

    registry.register(
        "lookup_contact",
        ToolDefinition(
            name="lookup_contact",
            description="Look up a contact in the CRM by name or phone number",
            parameters={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The contact's name to search for",
                    },
                    "phone": {
                        "type": "string",
                        "description": "The contact's phone number to search for",
                    },
                },
            },
            handler=lookup_contact,
        ),
    )

    registry.register(
        "get_contact_history",
        ToolDefinition(
            name="get_contact_history",
            description="Get recent conversation history for a contact by phone number",
            parameters={
                "type": "object",
                "properties": {
                    "contact_phone": {
                        "type": "string",
                        "description": "The contact's phone number",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of conversations to return",
                    },
                },
                "required": ["contact_phone"],
            },
            handler=get_contact_history,
        ),
    )

    registry.register(
        "update_contact_notes",
        ToolDefinition(
            name="update_contact_notes",
            description="Add notes to a contact's CRM record",
            parameters={
                "type": "object",
                "properties": {
                    "contact_phone": {
                        "type": "string",
                        "description": "The contact's phone number",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notes to add to the contact record",
                    },
                },
                "required": ["contact_phone", "notes"],
            },
            handler=update_contact_notes,
        ),
    )

    logger.info("Registered CRM tools: lookup_contact, get_contact_history, update_contact_notes")
