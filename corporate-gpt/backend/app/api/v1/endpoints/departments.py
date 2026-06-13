from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.department import Department

router = APIRouter(prefix="/departments", tags=["departments"])

@router.get("/")
async def list_departments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.organization_id == current_user.organization_id))
    return result.scalars().all()

@router.post("/")
async def create_department(name: str, description: str = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    dept = Department(organization_id=current_user.organization_id, name=name, description=description)
    db.add(dept)
    await db.flush()
    return dept
