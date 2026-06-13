from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, update, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get("/")
async def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications with pagination."""
    base_filter = [Notification.user_id == current_user.id]
    if unread_only:
        base_filter.append(Notification.is_read == False)
    # Count
    count_q = select(sa_func.count()).select_from(Notification).where(*base_filter)
    total = (await db.execute(count_q)).scalar() or 0
    # Query
    result = await db.execute(
        select(Notification).where(*base_filter)
        .order_by(Notification.created_at.desc())
        .limit(page_size).offset((page - 1) * page_size)
    )
    return {
        "items": result.scalars().all(),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "unread_count": unread_only or None,
    }

@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(Notification.id == notif_id, Notification.user_id == current_user.id).values(is_read=True))
    return {"status": "read"}

@router.post("/read-all")
async def mark_all_read(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(Notification.user_id == current_user.id).values(is_read=True))
    return {"status": "all_read"}
