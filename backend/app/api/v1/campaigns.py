
from app.database import get_db
from app.schemas.campaign import CampaignCreate, CampaignResponse, CampaignUpdate
from app.services.campaign_service import create_campaign, get_campaign, list_campaigns, update_campaign
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


@router.post("", response_model=CampaignResponse, status_code=201)
def api_create_campaign(data: CampaignCreate, db: Session = Depends(get_db)):
    campaign = create_campaign(db, data)
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        client_name=campaign.client_name,
        task_type=campaign.task_type,
        description=campaign.description,
        total_volume=campaign.total_volume,
        target_quality_pct=campaign.target_quality_pct,
        review_sampling_pct=campaign.review_sampling_pct,
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
    )


@router.get("", response_model=list[CampaignResponse])
def api_list_campaigns(status_filter: str | None = Query(None, alias="status"), db: Session = Depends(get_db)):
    campaigns = list_campaigns(db, status_filter=status_filter)
    return [
        CampaignResponse(
            id=c.id,
            name=c.name,
            client_name=c.client_name,
            task_type=c.task_type,
            description=c.description,
            total_volume=c.total_volume,
            target_quality_pct=c.target_quality_pct,
            review_sampling_pct=c.review_sampling_pct,
            target_daily_throughput=c.target_daily_throughput,
            start_date=c.start_date,
            due_date=c.due_date,
            priority=c.priority,
            status=c.status,
            calibration_required=c.calibration_required,
            required_annotators=c.required_annotators,
            required_reviewers=c.required_reviewers,
            created_at=c.created_at,
            updated_at=c.updated_at,
            required_skills=[s.skill_tag for s in c.skills],
        )
        for c in campaigns
    ]


@router.get("/{campaign_id}", response_model=CampaignResponse)
def api_get_campaign(campaign_id: str, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        client_name=campaign.client_name,
        task_type=campaign.task_type,
        description=campaign.description,
        total_volume=campaign.total_volume,
        target_quality_pct=campaign.target_quality_pct,
        review_sampling_pct=campaign.review_sampling_pct,
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
    )


@router.patch("/{campaign_id}", response_model=CampaignResponse)
def api_update_campaign(campaign_id: str, data: CampaignUpdate, db: Session = Depends(get_db)):
    campaign = update_campaign(db, campaign_id, data)
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        client_name=campaign.client_name,
        task_type=campaign.task_type,
        description=campaign.description,
        total_volume=campaign.total_volume,
        target_quality_pct=campaign.target_quality_pct,
        review_sampling_pct=campaign.review_sampling_pct,
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
    )
