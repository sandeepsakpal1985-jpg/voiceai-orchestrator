from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.analytics import AnalyticsEvent
from app.models.chat import Chat, Message
from app.models.document import Document
from app.models.feedback import Feedback
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/dashboard")
async def dashboard(days: int = Query(30), current_user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    org_id = current_user.organization_id
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Questions
    q_count = await db.execute(select(func.count()).select_from(Message)
                               .where(Message.role == "user", Message.created_at >= since,
                                      Message.chat.has(Chat.organization_id == org_id)))
    questions = q_count.scalar() or 0

    # Users
    u_count = await db.execute(select(func.count()).select_from(User)
                               .where(User.organization_id == org_id, User.is_active == True))
    users = u_count.scalar() or 0

    # Documents
    d_count = await db.execute(select(func.count()).select_from(Document)
                               .where(Document.organization_id == org_id, Document.is_active == True))
    documents = d_count.scalar() or 0

    # Feedback
    f_count = await db.execute(select(func.count()).select_from(Feedback)
                               .where(Feedback.rating == 1, Feedback.created_at >= since,
                                      Feedback.user.has(User.organization_id == org_id)))
    thumbs_up = f_count.scalar() or 0
    f_count = await db.execute(select(func.count()).select_from(Feedback)
                               .where(Feedback.rating == -1, Feedback.created_at >= since,
                                      Feedback.user.has(User.organization_id == org_id)))
    thumbs_down = f_count.scalar() or 0

    # Search success rate
    total = questions
    success_rate = 80.0  # placeholder - would need search result tracking

    return {
        "questions_total": questions,
        "questions_per_day": round(questions / max(days, 1), 1),
        "active_users": users,
        "total_documents": documents,
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "search_success_rate": success_rate,
        "period_days": days,
    }
