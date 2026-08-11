
from app.models.campaign import Campaign, CampaignSkill
from app.schemas.campaign import CampaignCreate, CampaignUpdate
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def create_campaign(db: Session, data: CampaignCreate) -> Campaign:
    existing = db.query(Campaign).filter(Campaign.name == data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Campaign with name '{data.name}' already exists."
        )

    campaign = Campaign(
        name=data.name,
        client_name=data.client_name,
        task_type=data.task_type,
        description=data.description,
        total_volume=data.total_volume,
        target_quality_pct=data.target_quality_pct,
        review_sampling_pct=data.review_sampling_pct,
        target_daily_throughput=data.target_daily_throughput,
        start_date=data.start_date,
        due_date=data.due_date,
        priority=data.priority,
        calibration_required=data.calibration_required,
        required_annotators=data.required_annotators,
        required_reviewers=data.required_reviewers,
    )
    db.add(campaign)
    db.flush()

    for skill_tag in data.required_skills:
        db.add(CampaignSkill(campaign_id=str(campaign.id), skill_tag=skill_tag))

    db.commit()
    db.refresh(campaign)

    log_audit(
        db,
        action="CAMPAIGN_CREATED",
        entity_type="CAMPAIGN",
        entity_id=str(campaign.id),
        summary=f"Created campaign '{campaign.name}' with volume {campaign.total_volume}."
    )
    return campaign


def get_campaign(db: Session, campaign_id: str) -> Campaign:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )
    return campaign


def list_campaigns(db: Session, status_filter: str | None = None) -> list[Campaign]:
    query = db.query(Campaign)
    if status_filter:
        query = query.filter(Campaign.status == status_filter)
    return list(query.order_by(Campaign.created_at.desc()).all())


def update_campaign(db: Session, campaign_id: str, data: CampaignUpdate) -> Campaign:
    campaign = get_campaign(db, campaign_id)
    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(campaign, key, value)

    db.commit()
    db.refresh(campaign)

    log_audit(
        db,
        action="CAMPAIGN_UPDATED",
        entity_type="CAMPAIGN",
        entity_id=str(campaign.id),
        summary=f"Updated campaign '{campaign.name}' fields: {list(update_data.keys())}."
    )
    return campaign
