
from app.database import get_db
from app.services.demo_service import (
    advance_demo_workday,
    bootstrap_demo_scenario,
    get_demo_provenance_metadata,
    reset_demo_scenario,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/demo", tags=["Public Demo Experience"])


@router.post("/bootstrap")
def api_bootstrap_demo(
    reset: bool = Query(False, description="Set True to force reset and re-seed demo data"),
    db: Session = Depends(get_db),
):
    return bootstrap_demo_scenario(db, force_recreate=reset)


@router.post("/advance-workday")
def api_advance_demo_workday(
    campaign_id: str | None = Query(None, description="Campaign ID to advance (defaults to demo campaign)"),
    db: Session = Depends(get_db),
):
    cid = campaign_id or "demo-campaign-ai-eval"
    return advance_demo_workday(db, campaign_id=cid)


@router.post("/reset")
def api_reset_demo(db: Session = Depends(get_db)):
    return reset_demo_scenario(db)


@router.get("/provenance")
def api_get_demo_provenance():
    return get_demo_provenance_metadata()
