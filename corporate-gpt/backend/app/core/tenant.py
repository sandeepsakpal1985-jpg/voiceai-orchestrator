"""Multi-tenant data isolation helpers."""

from sqlalchemy import select
from app.models.organization import Organization
from app.models.department import Department
from app.models.user import User


def tenant_filter(query, model, user: User):
    """Applies tenant isolation - only returns data from user's organization."""
    if user.is_super_admin:
        return query
    return query.where(model.organization_id == user.organization_id)
