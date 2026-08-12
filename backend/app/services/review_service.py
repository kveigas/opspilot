import math
from datetime import UTC, datetime

from app.models.campaign import Campaign
from app.models.escalation import Escalation
from app.models.review import Review
from app.models.task import Task
from app.models.worker import Worker
from app.schemas.review import ReviewCreate
from app.services.audit_service import log_audit
from app.services.qualification_helper import is_worker_qualified_for_campaign
from app.services.transition_service import transition_task_state
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def submit_review(db: Session, data: ReviewCreate) -> Review:
    task = db.query(Task).filter(Task.id == data.task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id '{data.task_id}' not found."
        )

    reviewer = db.query(Worker).filter(Worker.id == data.reviewer_id).first()
    if not reviewer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reviewer with id '{data.reviewer_id}' not found."
        )

    # 1. Reviewer Eligibility & Rules
    if not reviewer.is_active or reviewer.availability != "AVAILABLE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reviewer must be active and AVAILABLE."
        )

    if str(reviewer.role) != "REVIEWER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worker must have role 'REVIEWER' to submit QA reviews."
        )

    # SELF_REVIEW_PROHIBITED
    if task.assigned_worker_id and str(task.assigned_worker_id) == str(reviewer.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SELF_REVIEW_PROHIBITED: Worker cannot review their own task."
        )

    campaign = db.query(Campaign).filter(Campaign.id == task.campaign_id).first()
    if campaign and not is_worker_qualified_for_campaign(db, reviewer, campaign):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reviewer is not qualified for this campaign."
        )

    # 2. Reason code required for REWORK, BLOCK, ESCALATE
    if data.verdict in ["REWORK", "BLOCK", "ESCALATE"] and not data.reason_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reason code is required when submitting a '{data.verdict}' verdict."
        )

    # 3. Create Immutable Review Record
    now = datetime.now(UTC)
    review = Review(
        task_id=str(task.id),
        campaign_id=str(task.campaign_id),
        reviewer_id=str(reviewer.id),
        verdict=data.verdict,
        reason_code=data.reason_code,
        comment=data.comment,
        created_at=now,
        updated_at=now,
    )
    db.add(review)
    db.flush()

    # 4. Handle Verdict Transitions
    if data.verdict == "ACCEPT":
        # IN_REVIEW -> ACCEPTED -> COMPLETED
        transition_task_state(db, task, "ACCEPTED", reason="QA Verdict ACCEPT")
        transition_task_state(db, task, "COMPLETED", reason="Auto-completed on QA Accept")
        log_audit(
            db,
            action="REVIEW_COMPLETED",
            entity_type="REVIEW",
            entity_id=str(review.id),
            summary=f"Task '{task.id}' accepted by reviewer '{reviewer.name}'.",
        )

    elif data.verdict == "REWORK":
        # Increment rework counter
        task.rework_count = task.rework_count + 1
        db.flush()

        if task.rework_count >= 3:
            # Exceeded max rework limit (3 attempts) -> Create atomic Escalation record & transition to ESCALATED
            existing_esc = (
                db.query(Escalation)
                .filter(
                    Escalation.task_id == str(task.id),
                    Escalation.status.in_(["OPEN", "INVESTIGATING", "WAITING"]),
                )
                .first()
            )

            if not existing_esc:
                esc = Escalation(
                    campaign_id=str(task.campaign_id),
                    task_id=str(task.id),
                    title=f"MAX_REWORK_ATTEMPTS_EXCEEDED: Task {task.id[:8]}",
                    description=f"Task '{task.id}' exceeded maximum allowable rework attempts (Attempt {task.rework_count}). Reason: {data.reason_code or 'Repeated rework'}.",
                    severity="HIGH",
                    category="QUALITY",
                    status="OPEN",
                    blocker=True,
                    created_at=now,
                )
                db.add(esc)
                db.flush()

                log_audit(
                    db,
                    action="ESCALATION_CREATED",
                    entity_type="ESCALATION",
                    entity_id=str(esc.id),
                    summary=f"Auto-created HIGH severity escalation for task '{task.id}' due to MAX_REWORK_ATTEMPTS_EXCEEDED.",
                )

            transition_task_state(db, task, "ESCALATED", reason=f"Exceeded max rework attempts ({task.rework_count})")
            log_audit(
                db,
                action="REWORK_REQUESTED",
                entity_type="TASK",
                entity_id=str(task.id),
                summary=f"Task '{task.id}' exceeded max rework attempts ({task.rework_count}) and was ESCALATED.",
            )
        else:
            # Return to ASSIGNED for rework
            transition_task_state(db, task, "REWORK_REQUIRED", reason=data.comment or "QA Verdict REWORK")
            transition_task_state(db, task, "ASSIGNED", reason="Returned for rework")
            log_audit(
                db,
                action="REWORK_REQUESTED",
                entity_type="TASK",
                entity_id=str(task.id),
                summary=f"Task '{task.id}' requested rework (Attempt {task.rework_count}). Reason: {data.reason_code}.",
            )

    elif data.verdict == "BLOCK":
        transition_task_state(db, task, "BLOCKED", reason=data.comment or f"QA Verdict BLOCK ({data.reason_code})")
        log_audit(
            db,
            action="REVIEW_COMPLETED",
            entity_type="REVIEW",
            entity_id=str(review.id),
            summary=f"Task '{task.id}' blocked by reviewer. Reason: {data.reason_code}.",
        )

    elif data.verdict == "ESCALATE":
        # Manual escalation verdict -> Create Escalation record if not existing
        existing_esc = (
            db.query(Escalation)
            .filter(
                Escalation.task_id == str(task.id),
                Escalation.status.in_(["OPEN", "INVESTIGATING", "WAITING"]),
            )
            .first()
        )
        if not existing_esc:
            esc = Escalation(
                campaign_id=str(task.campaign_id),
                task_id=str(task.id),
                title=f"QA_REVIEW_ESCALATION: Task {task.id[:8]}",
                description=data.comment or f"QA Reviewer escalated task. Reason: {data.reason_code}",
                severity="HIGH",
                category="QUALITY",
                status="OPEN",
                blocker=True,
                created_at=now,
            )
            db.add(esc)
            db.flush()
            log_audit(
                db,
                action="ESCALATION_CREATED",
                entity_type="ESCALATION",
                entity_id=str(esc.id),
                summary=f"Created HIGH severity escalation from review verdict for task '{task.id}'.",
            )

        transition_task_state(db, task, "ESCALATED", reason=data.comment or f"QA Verdict ESCALATE ({data.reason_code})")
        log_audit(
            db,
            action="ESCALATION_CREATED",
            entity_type="TASK",
            entity_id=str(task.id),
            summary=f"Task '{task.id}' escalated by reviewer. Reason: {data.reason_code}.",
        )

    db.commit()
    db.refresh(review)
    return review


def process_review_sampling_for_submitted_tasks(db: Session, campaign_id: str) -> dict:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    submitted_tasks = (
        db.query(Task)
        .filter(
            Task.campaign_id == campaign_id,
            Task.state == "SUBMITTED",
        )
        .order_by(Task.created_at.asc(), Task.id.asc())
        .all()
    )

    total_submitted = len(submitted_tasks)
    sampling_pct = float(campaign.review_sampling_pct)

    batch_num = math.ceil(total_submitted * (sampling_pct / 100.0))
    required_reviews = math.ceil(int(campaign.total_volume) * (sampling_pct / 100.0))
    existing_reviews = db.query(Review).filter(Review.campaign_id == campaign_id).count()
    existing_in_review = db.query(Task).filter(Task.campaign_id == campaign_id, Task.state == "IN_REVIEW").count()
    needed_reviews = max(0, required_reviews - (existing_reviews + existing_in_review))

    num_to_review = min(total_submitted, max(batch_num, needed_reviews)) if (existing_reviews + existing_in_review > 0) else batch_num

    tasks_sent_to_review = 0
    tasks_auto_completed = 0

    for i, t in enumerate(submitted_tasks):
        if i < num_to_review:
            transition_task_state(db, t, "IN_REVIEW", reason="Selected for QA Sampling")
            tasks_sent_to_review += 1
        else:
            # Direct completion for un-sampled submitted tasks (NO Review record created)
            transition_task_state(db, t, "ACCEPTED", reason="Unsampled direct completion")
            transition_task_state(db, t, "COMPLETED", reason="Unsampled direct completion")
            tasks_auto_completed += 1

    return {
        "campaign_id": campaign_id,
        "total_submitted": total_submitted,
        "review_sampling_pct": sampling_pct,
        "tasks_sent_to_review": tasks_sent_to_review,
        "tasks_auto_completed": tasks_auto_completed,
    }


def list_reviews(
    db: Session,
    campaign_id: str | None = None,
    task_id: str | None = None,
    reviewer_id: str | None = None,
) -> list[Review]:
    query = db.query(Review)
    if campaign_id:
        query = query.filter(Review.campaign_id == campaign_id)
    if task_id:
        query = query.filter(Review.task_id == task_id)
    if reviewer_id:
        query = query.filter(Review.reviewer_id == reviewer_id)

    return list(query.order_by(Review.created_at.desc()).all())
