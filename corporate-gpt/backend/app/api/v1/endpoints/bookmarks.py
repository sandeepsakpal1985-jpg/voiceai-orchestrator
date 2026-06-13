from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.bookmark import Bookmark

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])

@router.get("/")
async def list_bookmarks(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bookmark).where(Bookmark.user_id == current_user.id).order_by(Bookmark.created_at.desc()))
    return result.scalars().all()

@router.post("/")
async def create_bookmark(bookmark_type: str, title: str, reference_id: str = None, snippet: str = None,
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    bm = Bookmark(user_id=current_user.id, bookmark_type=bookmark_type, title=title,
                  reference_id=reference_id, snippet=snippet)
    db.add(bm)
    return bm

@router.delete("/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == current_user.id))
    bm = result.scalar_one_or_none()
    if bm:
        await db.delete(bm)
    return {"status": "deleted"}
