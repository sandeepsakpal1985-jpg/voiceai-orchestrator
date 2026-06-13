"""
Authorization Provider — Casbin (pycasbin)
Thin wrapper around Casbin for RBAC/ABAC authorization with multi-tenant support.

Libraries: casbin, casbin-sqlalchemy-adapter
"""
import os
from typing import List, Optional

import casbin
from casbin import Enforcer
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


# ── Casbin RBAC Model Definition ──
RBAC_MODEL_CONF = """
[request_definition]
r = sub, obj, act

[policy_definition]
p = sub, obj, act

[role_definition]
g = _, _
g2 = _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub) && keyMatch2(r.obj, p.obj) && regexMatch(r.act, p.act)
"""


class AuthorizationProvider:
    """Thin wrapper around Casbin for role-based access control."""
    
    _enforcer: Optional[Enforcer] = None
    
    @classmethod
    def get_enforcer(cls) -> Enforcer:
        """Get or create the Casbin enforcer singleton."""
        if cls._enforcer is None:
            # Write model config
            model_path = os.path.join(
                settings.STORAGE_LOCAL_PATH or "./storage",
                "casbin_model.conf"
            )
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            
            if not os.path.exists(model_path):
                with open(model_path, 'w') as f:
                    f.write(RBAC_MODEL_CONF)
            
            # Initialize enforcer with file-based adapter
            # In production, use casbin-sqlalchemy-adapter for DB-backed policies
            policy_path = os.path.join(
                os.path.dirname(model_path),
                "casbin_policy.csv"
            )
            
            if not os.path.exists(policy_path):
                cls._create_default_policy(policy_path)
            
            cls._enforcer = casbin.Enforcer(model_path, policy_path)
        
        return cls._enforcer
    
    @classmethod
    def _create_default_policy(cls, path: str):
        """Create default RBAC policies."""
        with open(path, 'w') as f:
            f.write("""p, super_admin, /*, .*
p, company_admin, /api/v1/organizations/*, (read|write|delete)
p, company_admin, /api/v1/users/*, (read|write|delete)
p, company_admin, /api/v1/documents/*, (read|write|delete)
p, company_admin, /api/v1/analytics/*, read
p, company_admin, /api/v1/settings/*, (read|write)
p, department_admin, /api/v1/documents/*, (read|write)
p, department_admin, /api/v1/users/*, read
p, department_admin, /api/v1/analytics/*, read
p, employee, /api/v1/documents/*, read
p, employee, /api/v1/chat/*, (read|write)
p, employee, /api/v1/search/*, (read|write)
p, auditor, /api/v1/documents/*, read
p, auditor, /api/v1/analytics/*, read
p, auditor, /api/v1/audit-logs/*, read

g, super_admin, super_admin
g, company_admin, company_admin
g, department_admin, department_admin
g, employee, employee
g, auditor, auditor
""")
    
    @classmethod
    def check_permission(
        cls,
        user_role: str,
        resource: str,
        action: str
    ) -> bool:
        """Check if a role has permission on a resource with given action."""
        enforcer = cls.get_enforcer()
        return enforcer.enforce(user_role, resource, action)
    
    @classmethod
    def add_role(cls, user: str, role: str):
        """Assign a role to a user in the policy."""
        enforcer = cls.get_enforcer()
        enforcer.add_role_for_user(user, role)
    
    @classmethod
    def get_roles(cls, user: str) -> List[str]:
        """Get all roles for a user."""
        enforcer = cls.get_enforcer()
        return enforcer.get_roles_for_user(user)


# ── FastAPI Dependency ──
def require_permission(resource: str, action: str):
    """FastAPI dependency factory for Casbin permission checks."""
    async def permission_dependency(
        current_user = Depends(fastapi_users.current_user(active=True)),
    ):
        # Get user role (from FastAPI Users)
        role = getattr(current_user, "role", "employee")
        if not AuthorizationProvider.check_permission(role, resource, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {role} cannot {action} {resource}",
            )
        return current_user
    return permission_dependency


def get_enforcer():
    """FastAPI dependency that yields the Casbin enforcer."""
    return AuthorizationProvider.get_enforcer()
