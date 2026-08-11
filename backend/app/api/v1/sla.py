from datetime import date

from app.database import get_db
from app.schemas.sla import SLAResponse
from app.services.sla_service import evaluate_campaign_sla
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/campaigns", tags=["SLA Engine"])


@router.get("/{campaign_id}/sla", response_model=SLAResponse)
def api_get_campaign_sla(
    campaign_id: str,
    operational_date: date | None = Query(None, alias="date"),
    db: Session = Depends(get_db),
):
    sla = evaluate_campaign_sla(db, campaign_id, operational_date=operational_date)
    return SLAResponse(
        campaign_id=sla["campaign_id"],
        status=sla["status"],
        remaining_tasks=sla["remaining_tasks"],
        remaining_working_days=sla["remaining_working_days"],
        required_daily_rate=sla["required_daily_rate"],
        available_capacity=sla["available_capacity"],
        capacity_ratio=sla["capacity_ratio"],
        review_backlog_ratio=sla["review_backlog_ratio"],
        blocked_tasks=sla["blocked_tasks"],
        open_critical_escalations=sla["open_critical_escalations"],
        reason_codes=sla["reason_codes"],
        evaluated_at=sla["evaluated_at"],
    )
