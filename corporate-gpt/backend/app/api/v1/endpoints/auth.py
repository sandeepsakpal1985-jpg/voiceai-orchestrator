"""
Authentication Routes - FastAPI Users
Uses FastAPI Users library for all auth operations.
Provides thin custom endpoints on top of FastAPI Users defaults.
"""
from fastapi import APIRouter, Depends
from fastapi_users import schemas as fu_schemas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.providers.auth import (
    fastapi_users,
    auth_backend,
    current_active_user,
    current_superuser,
)
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

# -- FastAPI Users built-in routes --

class UserRead(fu_schemas.BaseUser):
    """User read schema."""
    pass

class UserCreate(fu_schemas.BaseUserCreate):
    """User create schema."""
    pass

class UserUpdate(fu_schemas.BaseUserUpdate):
    """User update schema."""
    pass

router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="",
)
router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="",
)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix="",
)
router.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="",
)

# -- Custom routes --

@router.get("/me")
async def get_current_user_info(
    user=Depends(current_active_user),
):
    """Get current user info."""
    return user


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    user=Depends(current_superuser),
):
    """List all users (superadmin only)."""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users
