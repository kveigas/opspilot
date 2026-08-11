from datetime import UTC, datetime

from app.models.task import Task
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

# Full Authoritative Transition Matrix
VALID_TRANSITIONS: dict[str, set[str]] = {
    "UNASSIGNED": {"ASSIGNED"},
    "ASSIGNED": {"IN_PROGRESS", "UNASSIGNED"},
    "IN_PROGRESS": {"SUBMITTED", "BLOCKED", "ESCALATED"},
    "SUBMITTED": {"IN_REVIEW", "ACCEPTED", "COMPLETED", "ESCALATED"},
    "IN_REVIEW": {"ACCEPTED", "REWORK_REQUIRED", "BLOCKED", "ESCALATED"},
    "REWORK_REQUIRED": {"ASSIGNED", "IN_PROGRESS"},
    "ACCEPTED": {"COMPLETED"},
    "BLOCKED": {"IN_PROGRESS", "ESCALATED"},
    "ESCALATED": {"IN_PROGRESS", "SUBMITTED", "COMPLETED"},
    "COMPLETED": set(),  # Terminal state
}


def transition_task_state(
    db: Session,
    task: Task,
    target_state: str,
    reason: str | None = None,
) -> Task:
    current_state = str(task.state)
    target_state = target_state.upper()

    if target_state == current_state:
        return task

    valid_targets = VALID_TRANSITIONS.get(current_state, set())
    if target_state not in valid_targets:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid task state transition from '{current_state}' to '{target_state}'."
        )

    now = datetime.now(UTC)
    task.state = target_state
    task.updated_at = now

    # State-dependent timestamp updates
    if target_state == "IN_PROGRESS" and task.started_at is None:
        task.started_at = now
    elif target_state == "SUBMITTED":
        task.submitted_at = now
    elif target_state == "COMPLETED":
        task.completed_at = now

    db.commit()
    db.refresh(task)

    summary_text = f"Transitioned task '{task.id}' state from '{current_state}' to '{target_state}'"
    if reason:
        summary_text += f" (Reason: {reason})"

    log_audit(
        db,
        action="TASK_STATE_CHANGED",
        entity_type="TASK",
        entity_id=str(task.id),
        summary=summary_text,
    )

    return task
