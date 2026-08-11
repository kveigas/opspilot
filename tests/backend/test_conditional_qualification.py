from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker
from app.services.qualification_helper import is_worker_qualified_for_campaign
from app.services.calibration_service import create_calibration_round, record_calibration_result
from app.schemas.calibration import CalibrationRoundCreate, CalibrationResultCreate


def test_conditional_qualification_rules(db_session):
    # Setup Worker
    worker = Worker(
        name="Test Worker",
        email="test_qual@example.com",
        role="ANNOTATOR",
        default_max_daily_capacity=30
    )
    db_session.add(worker)

    # 1. Campaign WITH calibration_required = True
    c_calib = Campaign(
        name="Calib Required Campaign",
        client_name="Test Client",
        task_type="TEXT_ANNOTATION",
        total_volume=500,
        target_daily_throughput=50,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=True
    )
    db_session.add(c_calib)

    # 2. Campaign WITHOUT calibration_required = False
    c_no_calib = Campaign(
        name="No Calib Campaign",
        client_name="Test Client",
        task_type="TEXT_ANNOTATION",
        total_volume=500,
        target_daily_throughput=50,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False
    )
    db_session.add(c_no_calib)
    db_session.commit()

    # TEST A: Uncalibrated worker on c_no_calib -> Qualified = True (calibration NOT required)
    assert is_worker_qualified_for_campaign(db_session, worker, c_no_calib) is True

    # TEST B: Uncalibrated worker on c_calib -> Qualified = False (calibration IS required)
    assert is_worker_qualified_for_campaign(db_session, worker, c_calib) is False

    # Perform Calibration Round for c_calib
    round_obj = create_calibration_round(
        db_session,
        CalibrationRoundCreate(
            campaign_id=c_calib.id,
            domain_tag="de",
            pass_threshold_pct=90.0,
            max_allowed_attempts=2
        )
    )

    # Worker passes calibration (95% >= 90%)
    record_calibration_result(
        db_session,
        round_obj.id,
        CalibrationResultCreate(worker_id=worker.id, score_pct=95.0)
    )

    # TEST C: Calibrated PASSED worker on c_calib -> Qualified = True
    assert is_worker_qualified_for_campaign(db_session, worker, c_calib) is True
