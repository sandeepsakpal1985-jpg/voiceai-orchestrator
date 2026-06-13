from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.feedback import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

@router.post("/")
async def submit_feedback(rating: int, message_id: str = None, comment: str = None,
                           current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fb = Feedback(organization_id=current_user.organization_id, user_id=current_user.id,
                  rating=rating, message_id=message_id, comment=comment)
    db.add(fb)
    return {"status": "submitted"}
