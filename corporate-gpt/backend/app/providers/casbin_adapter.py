"""
Casbin Adapter — SQLAlchemy-backed policy storage
Extends the Casbin provider with database-backed policies for production.
Policies are stored in the database instead of CSV files,
allowing dynamic role/permission updates without restarting.
"""
from typing import List, Optional

from casbin import Enforcer
from casbin_sqlalchemy_adapter import Adapter
from sqlalchemy import Column, String, Text
from sqlalchemy.orm import declarative_base

from app.core.config import settings

CasbinRuleBase = declarative_base()


class CasbinRule(CasbinRuleBase):
    """Database model for Casbin policies."""
    __tablename__ = "casbin_rules"
    
    id = Column(String, primary_key=True)
    ptype = Column(String(10), nullable=False)
    v0 = Column(Text, default="")
    v1 = Column(Text, default="")
    v2 = Column(Text, default="")
    v3 = Column(Text, default="")
    v4 = Column(Text, default="")
    v5 = Column(Text, default="")


class CasbinDBAdapter:
    """SQLAlchemy adapter for Casbin policies."""
    
    _enforcer: Optional[Enforcer] = None
    
    @classmethod
    async def initialize(cls, db_url: Optional[str] = None) -> Enforcer:
        """Initialize Casbin enforcer with database adapter."""
        if cls._enforcer is not None:
            return cls._enforcer
        
        url = db_url or settings.DATABASE_URL
        
        # Write model config if not exists
        import os
        model_path = os.path.join(
            settings.STORAGE_LOCAL_PATH or "./storage",
            "casbin_model.conf",
        )
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        if not os.path.exists(model_path):
            from app.providers.authorization import AuthorizationProvider
            with open(model_path, 'w') as f:
                f.write(AuthorizationProvider.RBAC_MODEL_CONF)
        
        # Initialize adapter and enforcer
        from sqlalchemy import create_engine
        engine = create_engine(
            url.replace("+asyncpg", "+psycopg2").replace("+asyncmy", "+pymysql")
        )
        adapter = Adapter(engine)
        
        # Create tables
        CasbinRuleBase.metadata.create_all(engine)
        
        cls._enforcer = Enforcer(model_path, adapter)
        
        # Load default policies if empty
        if not cls._enforcer.get_policy():
            await cls._load_default_policies()
        
        return cls._enforcer
    
    @classmethod
    async def _load_default_policies(cls):
        """Load default RBAC policies into database."""
        if cls._enforcer is None:
            return
        
        # Super admin
        cls._enforcer.add_permission_for_user("super_admin", "/*", ".*")
        
        # Company admin
        cls._enforcer.add_role_for_user("company_admin", "company_admin")
        cls._enforcer.add_permission_for_user("company_admin", "/api/v1/organizations/*", "(read|write|delete)")
        cls._enforcer.add_permission_for_user("company_admin", "/api/v1/users/*", "(read|write|delete)")
        cls._enforcer.add_permission_for_user("company_admin", "/api/v1/documents/*", "(read|write|delete)")
        
        # Department admin
        cls._enforcer.add_role_for_user("department_admin", "department_admin")
        cls._enforcer.add_permission_for_user("department_admin", "/api/v1/documents/*", "(read|write)")
        cls._enforcer.add_permission_for_user("department_admin", "/api/v1/users/*", "read")
        
        # Employee
        cls._enforcer.add_role_for_user("employee", "employee")
        cls._enforcer.add_permission_for_user("employee", "/api/v1/documents/*", "read")
        cls._enforcer.add_permission_for_user("employee", "/api/v1/chat/*", "(read|write)")
        
        # Auditor
        cls._enforcer.add_role_for_user("auditor", "auditor")
        cls._enforcer.add_permission_for_user("auditor", "/api/v1/analytics/*", "read")
        cls._enforcer.add_permission_for_user("auditor", "/api/v1/audit-logs/*", "read")
