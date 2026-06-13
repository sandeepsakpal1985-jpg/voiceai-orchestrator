"""JWT auth, password hashing, HMAC utilities."""

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, org_id: str, role: str,
                        extra: Optional[dict] = None,
                        expires: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires or timedelta(minutes=settings.JWT_EXPIRY_MINUTES))
    claims = {"sub": subject, "org": org_id, "role": role, "exp": expire,
              "iat": datetime.now(timezone.utc), "jti": str(uuid.uuid4())}
    if extra: claims.update(extra)
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, org_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRY_DAYS)
    return jwt.encode({"sub": subject, "org": org_id, "exp": expire,
                        "iat": datetime.now(timezone.utc), "jti": str(uuid.uuid4()), "type": "refresh"},
                       settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return {}


def verify_hmac(secret: str, payload: bytes, signature: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
