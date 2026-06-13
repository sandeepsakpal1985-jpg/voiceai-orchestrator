"""
CorporateGPT Enterprise - Database Seed Script
Creates super admin, system roles, and default permissions.
Run: python -m backend.seed
"""

import asyncio
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.hash import bcrypt

from app.core.database import get_session_factory
from app.models.organization import Organization
from app.models.role import Role
from app.models.user import User


SYSTEM_ROLES = [
    {
        "name": "Super Admin",
        "description": "Platform-wide super administrator",
        "is_system": True,
        "permissions": [
            "organization.create", "organization.read", "organization.update", "organization.delete",
            "user.create", "user.read", "user.update", "user.delete",
            "role.create", "role.read", "role.update", "role.delete",
            "document.create", "document.read", "document.update", "document.delete",
            "chat.create", "chat.read", "chat.update", "chat.delete",
            "analytics.read",
            "audit.read",
            "settings.read", "settings.update",
            "integration.create", "integration.read", "integration.update", "integration.delete",
            "knowledge_gap.read", "knowledge_gap.update",
            "faq.create", "faq.read", "faq.update", "faq.delete",
            "notification.create", "notification.read", "notification.update",
            "admin.access",
        ],
    },
    {
        "name": "Company Admin",
        "description": "Company-level administrator",
        "is_system": True,
        "permissions": [
            "organization.read",
            "user.create", "user.read", "user.update", "user.delete",
            "document.create", "document.read", "document.update", "document.delete",
            "chat.create", "chat.read",
            "analytics.read",
            "settings.read", "settings.update",
            "integration.read", "integration.create", "integration.update",
            "knowledge_gap.read",
            "faq.create", "faq.read", "faq.update",
            "notification.create", "notification.read",
        ],
    },
    {
        "name": "Department Admin",
        "description": "Department-level administrator",
        "is_system": True,
        "permissions": [
            "user.read",
            "document.create", "document.read", "document.update",
            "chat.create", "chat.read",
            "analytics.read",
            "knowledge_gap.read",
            "faq.read",
            "notification.read",
        ],
    },
    {
        "name": "Employee",
        "description": "Standard employee with AI assistant access",
        "is_system": True,
        "permissions": [
            "document.read",
            "chat.create", "chat.read",
            "faq.read",
            "notification.read",
        ],
    },
    {
        "name": "Auditor",
        "description": "Read-only auditor access",
        "is_system": True,
        "permissions": [
            "document.read",
            "analytics.read",
            "audit.read",
            "faq.read",
        ],
    },
]


async def seed():
    print("--- CorporateGPT Database Seed ---")
    async with get_session_factory()() as session:
        # Check if already seeded
        result = await session.execute(select(Role).where(Role.is_system == True))
        existing = result.scalars().first()
        if existing:
            print("System roles already exist - skipping seed.")
            return

        # Create or get default system organization
        result = await session.execute(
            select(Organization).where(Organization.slug == "system")
        )
        org = result.scalar_one_or_none()
        if not org:
            org = Organization(
                id=str(uuid.uuid4()),
                name="System Organization",
                slug="system",
            )
            session.add(org)
            await session.flush()
            print(f"  Created system organization: {org.id}")
        else:
            print(f"  Using existing system organization: {org.id}")

        # Create system roles with permissions
        roles = []
        for role_data in SYSTEM_ROLES:
            perms = {}
            for perm_name in role_data["permissions"]:
                perms[perm_name] = {
                    "name": perm_name,
                    "description": f"Permission to {perm_name}",
                    "resource": perm_name.split(".")[0] if "." in perm_name else perm_name,
                    "action": perm_name.split(".")[1] if "." in perm_name else "read",
                }

            role = Role(
                id=str(uuid.uuid4()),
            organization_id=org.id,
                name=role_data["name"],
                description=role_data["description"],
                is_system=role_data["is_system"],
                permissions=perms,
            )
            session.add(role)
            roles.append(role)
            print(f"  Created role: {role_data['name']} ({len(perms)} permissions)")

        await session.commit()
        print(f"Seeded {len(roles)} system roles with permissions.")


if __name__ == "__main__":
    asyncio.run(seed())
