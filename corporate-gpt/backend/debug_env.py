"""Debug: check environment variable sources for DATABASE_URL."""
import os

# 1. Check actual system env
sys_url = os.environ.get("DATABASE_URL", "NOT SET")
print(f"1. System env DATABASE_URL: {sys_url}")

# 2. Check pydantic-settings reading .env
from pydantic_settings import BaseSettings, SettingsConfigDict

class TestSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=True,
    )
    DATABASE_URL: str = "default"
    ENVIRONMENT: str = "development"

s = TestSettings()
print(f"2. Settings DATABASE_URL: {s.DATABASE_URL}")
print(f"3. Settings ENVIRONMENT: {s.ENVIRONMENT}")

# 3. Now load the real settings module
os.environ.pop("DATABASE_URL", None)  # clear system var to test
from app.core.config import settings
print(f"4. Core settings DATABASE_URL: {settings.DATABASE_URL}")
print(f"5. Core settings ENVIRONMENT: {settings.ENVIRONMENT}")
