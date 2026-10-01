
from app.database import get_db
from app.models.campaign import Campaign
from app.schemas.campaign import CampaignCreate, CampaignResponse, CampaignUpdate
from app.services.campaign_service import create_campaign, get_campaign, list_campaigns, update_campaign
from app.services.clock_service import get_operational_date, is_simulated
from app.services.forecast_service import forecast_completion
from app.services.quality_service import campaign_quality_report
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


def _to_campaign_response(db: Session, campaign: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        client_name=campaign.client_name,
        task_type=campaign.task_type,
        description=campaign.description,
        total_volume=campaign.total_volume,
        target_quality_pct=campaign.target_quality_pct,
        review_sampling_pct=campaign.review_sampling_pct,
        qa_policy=(campaign.qa_policy or "FLAT"),
        target_daily_throughput=campaign.target_daily_throughput,
        start_date=campaign.start_date,
        due_date=campaign.due_date,
        priority=campaign.priority,
        status=campaign.status,
        calibration_required=campaign.calibration_required,
        required_annotators=campaign.required_annotators,
        required_reviewers=campaign.required_reviewers,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        required_skills=[s.skill_tag for s in campaign.skills],
        operational_date=get_operational_date(db, campaign.id),
        simulated_clock=is_simulated(db, campaign.id),
    )


@router.post("", response_model=CampaignResponse, status_code=201)
def api_create_campaign(data: CampaignCreate, db: Session = Depends(get_db)):
    return _to_campaign_response(db, create_campaign(db, data))


@router.get("", response_model=list[CampaignResponse])
def api_list_campaigns(status_filter: str | None = Query(None, alias="status"), db: Session = Depends(get_db)):
    return [_to_campaign_response(db, c) for c in list_campaigns(db, status_filter=status_filter)]


@router.get("/{campaign_id}", response_model=CampaignResponse)
def api_get_campaign(campaign_id: str, db: Session = Depends(get_db)):
    return _to_campaign_response(db, get_campaign(db, campaign_id))


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def api_update_campaign(campaign_id: str, data: CampaignUpdate, db: Session = Depends(get_db)):
    return _to_campaign_response(db, update_campaign(db, campaign_id, data))


@router.get("/{campaign_id}/quality")
def api_get_campaign_quality(campaign_id: str, db: Session = Depends(get_db)):
    """Annotator trust tiers, adaptive QA rates, design-weighted quality and review effort."""
    return campaign_quality_report(db, get_campaign(db, campaign_id))


@router.get("/{campaign_id}/forecast")
def api_get_campaign_forecast(campaign_id: str, db: Session = Depends(get_db)):
    """Monte Carlo completion forecast (P50/P90 dates, probability of meeting the due date)."""
    return forecast_completion(db, get_campaign(db, campaign_id))


@router.get("/{campaign_id}/allocations")
def api_get_campaign_allocations(campaign_id: str, db: Session = Depends(get_db)):
    from app.models.allocation import Allocation
    from app.schemas.allocation import AllocationResponse
    allocs = list(db.query(Allocation).filter(Allocation.campaign_id == campaign_id).order_by(Allocation.allocated_at.desc()).all())
    return [
        AllocationResponse(
            id=a.id,
            allocation_run_id=a.allocation_run_id,
            campaign_id=a.campaign_id,
            task_id=a.task_id,
            worker_id=a.worker_id,
            operational_date=a.operational_date,
            allocated_at=a.allocated_at,
            deallocated_at=a.deallocated_at,
            status=a.status,
            reason=a.reason,
        )
        for a in allocs
    ]
