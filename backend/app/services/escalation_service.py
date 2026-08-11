from datetime import UTC, datetime

from app.models.escalation import Escalation
from app.models.task import Task
from app.schemas.escalation import EscalationCreate, EscalationStatusUpdate
from app.services.audit_service import log_audit
from app.services.transition_service import transition_task_state
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

# Authoritative Escalation Transition Matrix
VALID_ESCALATION_TRANSITIONS = {
    "OPEN": {"INVESTIGATING", "WAITING", "RESOLVED"},
    "INVESTIGATING": {"WAITING", "RESOLVED"},
    "WAITING": {"INVESTIGATING", "RESOLVED"},
    "RESOLVED": {"CLOSED"},
    "CLOSED": set(),
}


def create_escalation(db: Session, data: EscalationCreate) -> Escalation:
    now = datetime.now(UTC)
    esc = Escalation(
        campaign_id=data.campaign_id,
        task_id=data.task_id,
        owner_id=data.owner_id,
        title=data.title,
        description=data.description,
        severity=data.severity,
        category=data.category,
        blocker=data.blocker,
        status="OPEN",
        created_at=now,
        due_at=data.due_at,
    )
    db.add(esc)
    db.flush()

    if data.task_id:
        task = db.query(Task).filter(Task.id == data.task_id).first()
        if task and task.state in ["IN_REVIEW", "IN_PROGRESS", "ASSIGNED"]:
            transition_task_state(db, task, "ESCALATED", reason=f"Escalation created: {data.title}")

    db.commit()
    db.refresh(esc)

    log_audit(
        db,
        action="ESCALATION_CREATED",
        entity_type="ESCALATION",
        entity_id=str(esc.id),
        summary=f"Created {esc.severity} escalation '{esc.title}' for campaign '{esc.campaign_id}'.",
    )
    return esc


def update_escalation_status(db: Session, escalation_id: str, data: EscalationStatusUpdate) -> Escalation:
    esc = db.query(Escalation).filter(Escalation.id == escalation_id).first()
    if not esc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escalation with id '{escalation_id}' not found."
        )

    current_status = str(esc.status)
    target_status = data.status.upper()

    if target_status != current_status:
        valid_targets = VALID_ESCALATION_TRANSITIONS.get(current_status, set())
        if target_status not in valid_targets:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Invalid escalation transition from '{current_status}' to '{target_status}'."
            )
        esc.status = target_status

    if data.owner_id is not None:
        esc.owner_id = data.owner_id

    now = datetime.now(UTC)

    if target_status in ["RESOLVED", "CLOSED"]:
        if data.resolution:
            esc.resolution = data.resolution
        if esc.resolved_at is None:
            esc.resolved_at = now

        log_audit(
            db,
            action="ESCALATION_RESOLVED",
            entity_type="ESCALATION",
            entity_id=str(esc.id),
            summary=f"Escalation '{esc.id}' marked {target_status}. Resolution: {esc.resolution or 'Resolved'}.",
        )

        # Handle post-resolution task state transition
        if esc.task_id and data.target_task_state:
            task = db.query(Task).filter(Task.id == str(esc.task_id)).first()
            if task and task.state == "ESCALATED":
                transition_task_state(db, task, data.target_task_state, reason=f"Escalation {esc.id} resolved")
    else:
        log_audit(
            db,
            action="ESCALATION_STATUS_CHANGED",
            entity_type="ESCALATION",
            entity_id=str(esc.id),
            summary=f"Updated escalation '{esc.id}' status to {target_status}.",
        )

    db.commit()
    db.refresh(esc)
    return esc


def list_escalations(
    db: Session,
    campaign_id: str | None = None,
    status_filter: str | None = None,
    severity: str | None = None,
) -> list[Escalation]:
    query = db.query(Escalation)
    if campaign_id:
        query = query.filter(Escalation.campaign_id == campaign_id)
    if status_filter:
        query = query.filter(Escalation.status == status_filter)
    if severity:
        query = query.filter(Escalation.severity == severity)

    return list(query.order_by(Escalation.created_at.desc()).all())
