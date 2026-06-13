from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit_logs"])

@router.get("/")
async def list_audit_logs(action: str = None, resource_type: str = None, page: int = Query(1, ge=1),
                           page_size: int = Query(50, ge=1, le=100),
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(AuditLog).where(AuditLog.organization_id == current_user.organization_id)
    if action: query = query.where(AuditLog.action == action)
    if resource_type: query = query.where(AuditLog.resource_type == resource_type)
    query = query.order_by(AuditLog.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    result = await db.execute(query)
    return result.scalars().all()
