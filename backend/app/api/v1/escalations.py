
from app.database import get_db
from app.schemas.escalation import EscalationCreate, EscalationResponse, EscalationStatusUpdate
from app.services.escalation_service import create_escalation, list_escalations, update_escalation_status
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/escalations", tags=["Escalations"])


@router.post("", response_model=EscalationResponse, status_code=201)
def api_create_escalation(data: EscalationCreate, db: Session = Depends(get_db)):
    esc = create_escalation(db, data)
    return EscalationResponse(
        id=esc.id,
        campaign_id=esc.campaign_id,
        task_id=esc.task_id,
        owner_id=esc.owner_id,
        title=esc.title,
        description=esc.description,
        severity=esc.severity,
        category=esc.category,
        status=esc.status,
        blocker=esc.blocker,
        resolution=esc.resolution,
        created_at=esc.created_at,
        due_at=esc.due_at,
        resolved_at=esc.resolved_at,
    )


@router.get("", response_model=list[EscalationResponse])
def api_list_escalations(
    campaign_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = Query(None),
    db: Session = Depends(get_db),
):
    escalations = list_escalations(db, campaign_id=campaign_id, status_filter=status_filter, severity=severity)
    return [
        EscalationResponse(
            id=e.id,
            campaign_id=e.campaign_id,
            task_id=e.task_id,
            owner_id=e.owner_id,
            title=e.title,
            description=e.description,
            severity=e.severity,
            category=e.category,
            status=e.status,
            blocker=e.blocker,
            resolution=e.resolution,
            created_at=e.created_at,
            due_at=e.due_at,
            resolved_at=e.resolved_at,
        )
        for e in escalations
    ]


@router.patch("/{escalation_id}/status", response_model=EscalationResponse)
def api_update_escalation_status(
    escalation_id: str, data: EscalationStatusUpdate, db: Session = Depends(get_db)
):
    esc = update_escalation_status(db, escalation_id, data)
    return EscalationResponse(
        id=esc.id,
        campaign_id=esc.campaign_id,
        task_id=esc.task_id,
        owner_id=esc.owner_id,
        title=esc.title,
        description=esc.description,
        severity=esc.severity,
        category=esc.category,
        status=esc.status,
        blocker=esc.blocker,
        resolution=esc.resolution,
        created_at=esc.created_at,
        due_at=esc.due_at,
        resolved_at=esc.resolved_at,
    )
