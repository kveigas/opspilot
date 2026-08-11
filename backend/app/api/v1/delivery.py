from app.database import get_db
from app.schemas.delivery import DeliveryGateResult, DeliveryReadinessResponse
from app.services.delivery_service import evaluate_delivery_readiness
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/campaigns", tags=["Delivery Readiness"])


@router.get("/{campaign_id}/delivery-readiness", response_model=DeliveryReadinessResponse)
def api_get_delivery_readiness(campaign_id: str, db: Session = Depends(get_db)):
    deliv = evaluate_delivery_readiness(db, campaign_id)
    return DeliveryReadinessResponse(
        campaign_id=deliv["campaign_id"],
        status=deliv["status"],
        evaluated_at=deliv["evaluated_at"],
        gates=[
            DeliveryGateResult(
                gate=g["gate"],
                passed=g["passed"],
                reason=g["reason"],
                evidence=g["evidence"],
            )
            for g in deliv["gates"]
        ],
        warnings=deliv["warnings"],
        blocking_reasons=deliv["blocking_reasons"],
    )
