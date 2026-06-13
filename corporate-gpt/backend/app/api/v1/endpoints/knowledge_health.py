from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.knowledge_gap import KnowledgeGap
from app.services.knowledge_health import analyze_knowledge_health

router = APIRouter(prefix="/knowledge-health", tags=["knowledge_health"])

@router.get("/")
async def health_overview(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await analyze_knowledge_health(current_user.organization_id, db)

@router.get("/gaps")
async def list_gaps(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeGap).where(KnowledgeGap.organization_id == current_user.organization_id)
        .order_by(KnowledgeGap.created_at.desc()).limit(100)
    )
    return result.scalars().all()
