"""Auto-generated FAQ service."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.faq import FAQ


async def get_faqs(org_id: str, db: AsyncSession, department: str = None):
    query = select(FAQ).where(FAQ.organization_id == org_id, FAQ.is_published == True)
    if department:
        query = query.where(FAQ.department == department)
    query = query.order_by(FAQ.times_asked.desc())
    result = await db.execute(query)
    return result.scalars().all()
