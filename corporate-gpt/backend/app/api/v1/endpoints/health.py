"""Health check endpoint."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "CorporateGPT", "version": "1.0.0"}
