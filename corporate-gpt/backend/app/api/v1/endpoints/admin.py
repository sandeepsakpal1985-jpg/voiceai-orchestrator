from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.organization import Organization

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/stats")
async def admin_stats(current_user: User = Depends(get_current_user)):
    if not current_user.is_super_admin:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return {"status": "super_admin_required", "user": current_user.email}
