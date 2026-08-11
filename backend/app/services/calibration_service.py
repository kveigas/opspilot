from datetime import UTC, datetime

from app.models.calibration import CalibrationResult, CalibrationRound
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerQualification
from app.schemas.calibration import CalibrationResultCreate, CalibrationRoundCreate
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def create_calibration_round(db: Session, data: CalibrationRoundCreate) -> CalibrationRound:
    campaign = db.query(Campaign).filter(Campaign.id == data.campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{data.campaign_id}' not found."
        )

    round_obj = CalibrationRound(
        campaign_id=data.campaign_id,
        domain_tag=data.domain_tag,
        total_test_tasks=data.total_test_tasks,
        pass_threshold_pct=data.pass_threshold_pct,
        max_allowed_attempts=data.max_allowed_attempts,
        status="ACTIVE",
    )
    db.add(round_obj)
    db.commit()
    db.refresh(round_obj)

    log_audit(
        db,
        action="CALIBRATION_CREATED",
        entity_type="CALIBRATION_ROUND",
        entity_id=str(round_obj.id),
        summary=f"Created calibration round for domain '{round_obj.domain_tag}' (pass threshold {round_obj.pass_threshold_pct}%)."
    )
    return round_obj


def get_calibration_round(db: Session, round_id: str) -> CalibrationRound:
    round_obj = db.query(CalibrationRound).filter(CalibrationRound.id == round_id).first()
    if not round_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Calibration round with id '{round_id}' not found."
        )
    return round_obj


def list_calibration_rounds(db: Session, campaign_id: str | None = None) -> list[CalibrationRound]:
    query = db.query(CalibrationRound)
    if campaign_id:
        query = query.filter(CalibrationRound.campaign_id == campaign_id)
    return list(query.order_by(CalibrationRound.created_at.desc()).all())


def record_calibration_result(
    db: Session, round_id: str, data: CalibrationResultCreate
) -> CalibrationResult:
    round_obj = get_calibration_round(db, round_id)
    worker = db.query(Worker).filter(Worker.id == data.worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker with id '{data.worker_id}' not found."
        )

    existing_attempts = (
        db.query(CalibrationResult)
        .filter(
            CalibrationResult.round_id == round_id,
            CalibrationResult.worker_id == data.worker_id,
        )
        .count()
    )

    attempt_number = existing_attempts + 1

    if attempt_number > int(round_obj.max_allowed_attempts):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Worker '{worker.name}' has exceeded maximum allowed attempts ({round_obj.max_allowed_attempts}) for this round."
        )

    is_pass = data.score_pct >= float(round_obj.pass_threshold_pct)

    if is_pass:
        qual_status = "PASSED"
    elif attempt_number >= int(round_obj.max_allowed_attempts):
        qual_status = "FAILED"
    else:
        qual_status = "RETRY_REQUIRED"

    result = CalibrationResult(
        round_id=round_id,
        worker_id=data.worker_id,
        score_pct=data.score_pct,
        passed=is_pass,
        attempt_number=attempt_number,
    )
    db.add(result)

    qual = (
        db.query(WorkerQualification)
        .filter(
            WorkerQualification.worker_id == data.worker_id,
            WorkerQualification.campaign_id == str(round_obj.campaign_id),
        )
        .first()
    )

    now = datetime.now(UTC)
    if qual:
        qual.status = qual_status
        qual.score = data.score_pct
        qual.attempts_used = attempt_number
        if is_pass:
            qual.qualified_at = now
    else:
        qual = WorkerQualification(
            worker_id=data.worker_id,
            campaign_id=str(round_obj.campaign_id),
            status=qual_status,
            score=data.score_pct,
            attempts_used=attempt_number,
            qualified_at=now if is_pass else None,
        )
        db.add(qual)

    db.commit()
    db.refresh(result)

    log_audit(
        db,
        action="CALIBRATION_RESULT_RECORDED",
        entity_type="CALIBRATION_RESULT",
        entity_id=str(result.id),
        summary=f"Recorded calibration attempt #{attempt_number} for worker '{worker.name}': score {data.score_pct}%, status {qual_status}."
    )
    log_audit(
        db,
        action="QUALIFICATION_CHANGED",
        entity_type="WORKER_QUALIFICATION",
        entity_id=str(qual.id),
        summary=f"Qualification status for worker '{worker.name}' on campaign '{round_obj.campaign_id}' updated to {qual_status}."
    )

    return result
