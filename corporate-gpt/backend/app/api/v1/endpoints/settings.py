"""Organization settings management."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.organization import Organization
from pydantic import BaseModel
from typing import Optional


class OrgSettingsUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    max_users: Optional[int] = None
    max_documents: Optional[int] = None
    settings: Optional[dict] = None


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/")
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get organization settings."""
    result = await db.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404)
    return {
        "name": org.name,
        "domain": org.domain,
        "max_users": org.max_users,
        "max_documents": org.max_documents,
        "max_storage_mb": getattr(org, "max_storage_mb", 5000),
        "settings": org.settings or {},
    }


@router.patch("/")
async def update_settings(
    update: OrgSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update organization settings."""
    result = await db.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404)
    for k, v in update.model_dump(exclude_unset=True).items():
        setattr(org, k, v)
    return {"status": "updated"}
