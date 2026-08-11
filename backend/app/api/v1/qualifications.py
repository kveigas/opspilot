from app.database import get_db
from app.services.campaign_service import get_campaign
from app.services.qualification_helper import is_worker_qualified_for_campaign
from app.services.worker_service import get_worker
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/qualifications", tags=["Qualifications"])


@router.get("/check")
def api_check_qualification(
    worker_id: str, campaign_id: str, db: Session = Depends(get_db)
):
    worker = get_worker(db, worker_id)
    campaign = get_campaign(db, campaign_id)

    qualified = is_worker_qualified_for_campaign(db, worker, campaign)

    return {
        "worker_id": worker.id,
        "campaign_id": campaign.id,
        "calibration_required": campaign.calibration_required,
        "qualified": qualified,
    }
