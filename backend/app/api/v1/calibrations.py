
from app.database import get_db
from app.schemas.calibration import (
    CalibrationResultCreate,
    CalibrationResultResponse,
    CalibrationRoundCreate,
    CalibrationRoundResponse,
)
from app.services.calibration_service import (
    create_calibration_round,
    get_calibration_round,
    list_calibration_rounds,
    record_calibration_result,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/calibrations", tags=["Calibrations"])


def _to_round_response(r) -> CalibrationRoundResponse:
    return CalibrationRoundResponse(
        id=r.id,
        campaign_id=r.campaign_id,
        domain_tag=r.domain_tag,
        total_test_tasks=r.total_test_tasks,
        pass_threshold_pct=r.pass_threshold_pct,
        max_allowed_attempts=r.max_allowed_attempts,
        status=r.status,
        created_at=r.created_at,
        results=[
            CalibrationResultResponse(
                id=res.id,
                round_id=res.round_id,
                worker_id=res.worker_id,
                score_pct=res.score_pct,
                passed=res.passed,
                attempt_number=res.attempt_number,
                evaluated_at=res.evaluated_at,
            )
            for res in r.results
        ],
    )


@router.post("", response_model=CalibrationRoundResponse, status_code=201)
def api_create_calibration_round(data: CalibrationRoundCreate, db: Session = Depends(get_db)):
    round_obj = create_calibration_round(db, data)
    return _to_round_response(round_obj)


@router.get("", response_model=list[CalibrationRoundResponse])
def api_list_calibration_rounds(
    campaign_id: str | None = Query(None), db: Session = Depends(get_db)
):
    rounds = list_calibration_rounds(db, campaign_id=campaign_id)
    return [_to_round_response(r) for r in rounds]


@router.get("/{round_id}", response_model=CalibrationRoundResponse)
def api_get_calibration_round(round_id: str, db: Session = Depends(get_db)):
    round_obj = get_calibration_round(db, round_id)
    return _to_round_response(round_obj)


@router.post("/{round_id}/results", response_model=CalibrationResultResponse, status_code=201)
def api_record_calibration_result(
    round_id: str, data: CalibrationResultCreate, db: Session = Depends(get_db)
):
    result = record_calibration_result(db, round_id, data)
    return CalibrationResultResponse(
        id=result.id,
        round_id=result.round_id,
        worker_id=result.worker_id,
        score_pct=result.score_pct,
        passed=result.passed,
        attempt_number=result.attempt_number,
        evaluated_at=result.evaluated_at,
    )
