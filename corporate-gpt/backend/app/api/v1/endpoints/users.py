from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import OrganizationResponse

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/")
async def list_users(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.organization_id == current_user.organization_id))
    return result.scalars().all()

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.delete("/{user_id}")
async def deactivate_user(user_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id, User.organization_id == current_user.organization_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404)
    user.is_active = False
    return {"status": "deactivated"}
