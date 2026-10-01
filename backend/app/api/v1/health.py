from app.config import VERSION
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OpsPilot API",
        "version": VERSION,
        "phase": VERSION,
    }
