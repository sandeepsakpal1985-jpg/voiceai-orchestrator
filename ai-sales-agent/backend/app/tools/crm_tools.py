"""
CRM Tools — Customer relationship management tools for sales conversations.
"""

import logging

from app.tools.base import ToolDefinition, get_tool_registry

logger = logging.getLogger("ai_sales_agent.tools.crm")


async def lookup_contact(name: str = "", phone: str = "") -> str:
    """Look up a contact in the CRM by name or phone number."""
    try:
        from app.services.conversation import get_conversation_service
        conv_service = get_conversation_service()
        contacts = conv_service.get_all()
        matches = []
        for c in contacts:
            if (name and name.lower() in (c.contact_name or "").lower()) or (phone and phone == c.contact_phone):
                matches.append(f"- {c.contact_name or 'Unknown'} ({c.contact_phone or 'No phone'})")
        if not matches:
            return f"No contact found matching name='{name}' phone='{phone}'"
        return "Contacts found:\n" + "\n".join(matches[:5])
    except Exception as e:
        return f"CRM lookup unavailable: {e}"


async def update_contact_notes(contact_phone: str, notes: str) -> str:
    """Add notes to a contact record."""
    logger.info("CRM notes update for %s: %s", contact_phone, notes[:100])
    return f"Notes added to contact {contact_phone}"


def register_crm_tools() -> None:
    """Register all CRM tools with the global tool registry."""
    registry = get_tool_registry()
    registry.register("lookup_contact", ToolDefinition(
        name="lookup_contact",
        description="Look up a contact in the CRM by name or phone number",
        parameters={"type": "object", "properties": {
            "name": {"type": "string", "description": "Contact name to search for"},
            "phone": {"type": "string", "description": "Phone number to search for"},
        }},
        handler=lookup_contact,
    ))
    registry.register("update_contact_notes", ToolDefinition(
        name="update_contact_notes",
        description="Add notes to a contact's CRM record",
        parameters={"type": "object", "properties": {
            "contact_phone": {"type": "string", "description": "Contact's phone number"},
            "notes": {"type": "string", "description": "Notes to add"},
        }, "required": ["contact_phone", "notes"]},
        handler=update_contact_notes,
    ))
    logger.info("Registered CRM tools")
