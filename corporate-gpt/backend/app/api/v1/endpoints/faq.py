from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.faq import FAQ

router = APIRouter(prefix="/faq", tags=["faq"])

@router.get("/")
async def list_faqs(department: str = Query(None), current_user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    query = select(FAQ).where(FAQ.organization_id == current_user.organization_id, FAQ.is_published == True)
    if department:
        query = query.where(FAQ.department == department)
    query = query.order_by(FAQ.times_asked.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/{faq_id}/ask")
async def record_ask(faq_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FAQ).where(FAQ.id == faq_id, FAQ.organization_id == current_user.organization_id))
    faq = result.scalar_one_or_none()
    if faq:
        faq.times_asked += 1
    return {"status": "recorded"}
