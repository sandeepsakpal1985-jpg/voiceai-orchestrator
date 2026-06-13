from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class OrganizationCreate(BaseModel):
    name: str
    slug: str
    domain: Optional[str] = None
    max_users: Optional[int] = 10

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    max_users: Optional[int] = None

class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    domain: Optional[str]
    max_users: int
    is_active: bool
    created_at: datetime
