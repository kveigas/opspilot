from app.database import get_db
from app.services.today_service import get_today_manager_cockpit
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/today", tags=["Today Cockpit"])


@router.get("")
def api_get_today_cockpit(db: Session = Depends(get_db)):
    return get_today_manager_cockpit(db)
