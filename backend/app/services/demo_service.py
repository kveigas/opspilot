from datetime import UTC, date, datetime

from app.models.allocation import Allocation, AllocationRun
from app.models.calibration import CalibrationResult, CalibrationRound
from app.models.campaign import Campaign, CampaignSkill
from app.models.capacity import WorkerDailyCapacity
from app.models.escalation import Escalation
from app.models.review import Review
from app.models.task import Task, TaskSkill
from app.models.worker import Worker, WorkerQualification, WorkerSkill
from app.schemas.review import ReviewCreate
from app.services.audit_service import log_audit
from app.services.delivery_service import evaluate_delivery_readiness
from app.services.review_service import process_review_sampling_for_submitted_tasks, submit_review
from app.services.sla_service import evaluate_campaign_sla
from app.services.transition_service import transition_task_state
from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

DEMO_CAMPAIGN_ID = "demo-campaign-ai-eval"
DEMO_SCENARIO_NAME = "Multilingual AI Response Evaluation"
DEMO_SEED_ID = "SEED_OPSPILOT_DEMO_2026"


def get_demo_provenance_metadata() -> dict:
    return {
        "scenario_name": DEMO_SCENARIO_NAME,
        "scenario_version": "1.0.0",
        "seed_identifier": DEMO_SEED_ID,
        "synthetic": True,
        "environment": "public_demo",
    }


def _purge_demo_entities(db: Session):
    demo_camps = db.query(Campaign).filter(
        or_(Campaign.id == DEMO_CAMPAIGN_ID, Campaign.name == DEMO_SCENARIO_NAME)
    ).all()

    for demo_camp in demo_camps:
        db.query(Review).filter(Review.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(Escalation).filter(Escalation.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(Allocation).filter(Allocation.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(AllocationRun).filter(AllocationRun.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(Task).filter(Task.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(CampaignSkill).filter(CampaignSkill.campaign_id == demo_camp.id).delete(synchronize_session=False)

        demo_rounds = db.query(CalibrationRound).filter(CalibrationRound.campaign_id == demo_camp.id).all()
        for r in demo_rounds:
            db.query(CalibrationResult).filter(CalibrationResult.round_id == r.id).delete(synchronize_session=False)
        db.query(CalibrationRound).filter(CalibrationRound.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.delete(demo_camp)

    demo_workers = db.query(Worker).filter(Worker.email.like("%@demo.opspilot.internal")).all()
    for w in demo_workers:
        db.query(WorkerSkill).filter(WorkerSkill.worker_id == w.id).delete(synchronize_session=False)
        db.query(WorkerQualification).filter(WorkerQualification.worker_id == w.id).delete(synchronize_session=False)
        db.query(WorkerDailyCapacity).filter(WorkerDailyCapacity.worker_id == w.id).delete(synchronize_session=False)
        db.delete(w)

    db.commit()


def _create_fresh_demo_scenario(db: Session) -> dict:
    now_utc = datetime.now(UTC)
    today_date = date(2026, 8, 11)

    # 1. Create Demo Campaign
    camp = Campaign(
        id=DEMO_CAMPAIGN_ID,
        name=DEMO_SCENARIO_NAME,
        client_name="Synthetic AI Operations Lab",
        task_type="RESPONSE_EVALUATION",
        description="Deterministic demo campaign evaluating model preference across multilingual instruction datasets.",
        total_volume=2000,
        target_quality_pct=95.0,
        review_sampling_pct=20.0,
        target_daily_throughput=200,
        start_date=date(2026, 8, 1),
        due_date=date(2026, 8, 20),
        priority="HIGH",
        status="ACTIVE",
        calibration_required=True,
        required_annotators=12,
        required_reviewers=3,
        created_at=now_utc,
    )
    db.add(camp)
    db.flush()

    for skill in ["en", "es", "de"]:
        db.add(CampaignSkill(campaign_id=camp.id, skill_tag=skill))
    db.flush()

    # 2. Create 16 Demo Workers
    workers = []

    # 12 Annotators
    for i in range(1, 13):
        email = f"annotator{i}@demo.opspilot.internal"
        max_cap = 10 if i == 12 else 150
        is_avail = "INACTIVE" if i == 10 else "AVAILABLE"
        w = Worker(
            id=f"demo-worker-ann-{i:02d}",
            name=f"Annotator {i:02d} ({'Constrained' if i==12 else 'Inactive' if i==10 else 'Qualified'})",
            email=email,
            role="ANNOTATOR",
            is_active=True,
            availability=is_avail,
            default_max_daily_capacity=max_cap,
            created_at=now_utc,
        )
        workers.append(w)

    # 3 Reviewers
    for i in range(1, 4):
        w = Worker(
            id=f"demo-worker-rev-{i:02d}",
            name=f"Lead Reviewer {i:02d}",
            email=f"reviewer{i}@demo.opspilot.internal",
            role="REVIEWER",
            is_active=True,
            availability="AVAILABLE",
            default_max_daily_capacity=200,
            created_at=now_utc,
        )
        workers.append(w)

    # 1 Manager Lead
    lead_w = Worker(
        id="demo-worker-lead-01",
        name="Ops Manager Lead",
        email="lead@demo.opspilot.internal",
        role="MANAGER",
        is_active=True,
        availability="AVAILABLE",
        default_max_daily_capacity=0,
        created_at=now_utc,
    )
    workers.append(lead_w)
    db.add_all(workers)
    db.flush()

    # Skills & Qualifications
    for w in workers:
        if w.role in ["ANNOTATOR", "REVIEWER"]:
            for skill in ["en", "es", "de"]:
                db.add(WorkerSkill(worker_id=w.id, skill_tag=skill))

            # Calibrate 10 annotators as PASSED, worker 11 as FAILED
            if w.id == "demo-worker-ann-11":
                db.add(WorkerQualification(
                    worker_id=w.id,
                    campaign_id=camp.id,
                    status="FAILED",
                    score=62.5,
                    attempts_used=1,
                    qualified_at=now_utc,
                ))
            elif w.role == "ANNOTATOR":
                db.add(WorkerQualification(
                    worker_id=w.id,
                    campaign_id=camp.id,
                    status="PASSED",
                    score=96.0,
                    attempts_used=1,
                    qualified_at=now_utc,
                ))

    # Daily Capacities
    for w in workers:
        if w.role == "ANNOTATOR":
            alloc_val = 10 if w.id == "demo-worker-ann-12" else 0
            db.add(WorkerDailyCapacity(
                worker_id=w.id,
                capacity_date=today_date,
                max_daily_capacity=w.default_max_daily_capacity,
                allocated_for_date=alloc_val,
            ))

    db.flush()

    # 3. Bulk Seed 2,000 Tasks (Deterministic Initial Unhealthy State)
    tasks = []
    for i in range(1, 2001):
        if i <= 600:
            state = "COMPLETED"
        elif i <= 1000:
            state = "IN_PROGRESS"
        elif i <= 1800:
            state = "UNASSIGNED"
        elif i <= 1950:
            state = "SUBMITTED"
        else:
            state = "BLOCKED"

        assigned_w = f"demo-worker-ann-{(i % 9) + 1:02d}" if state != "UNASSIGNED" else None
        rework_c = 2 if (i % 100 == 0 and state != "COMPLETED") else 0

        t = Task(
            id=f"demo-task-{i:04d}",
            campaign_id=camp.id,
            external_reference=f"SYN-EVAL-{i:04d}",
            task_type="RESPONSE_EVALUATION",
            priority="HIGH" if i % 10 == 0 else "MEDIUM",
            state=state,
            rework_count=rework_c,
            assigned_worker_id=assigned_w,
            operational_date=today_date if state != "UNASSIGNED" else None,
            created_at=now_utc,
            updated_at=now_utc,
            started_at=now_utc if state in ["IN_PROGRESS", "SUBMITTED", "COMPLETED", "BLOCKED"] else None,
            submitted_at=now_utc if state in ["SUBMITTED", "COMPLETED"] else None,
            completed_at=now_utc if state == "COMPLETED" else None,
        )
        tasks.append(t)

    db.add_all(tasks)
    db.flush()

    for t in tasks:
        db.add(TaskSkill(task_id=t.id, skill_tag="en"))
    db.flush()

    # 4. Seed Initial Critical Escalation
    esc = Escalation(
        id="demo-esc-guidelines-01",
        campaign_id=camp.id,
        task_id="demo-task-1951",
        owner_id="demo-worker-lead-01",
        title="Guidelines Ambiguity: Escalated Model Preference Standard",
        description="Model preference criteria for guideline section 4.2 conflicts with client quality standard.",
        severity="CRITICAL",
        category="GUIDELINE",
        status="OPEN",
        blocker=True,
        created_at=now_utc,
    )
    db.add(esc)

    db.commit()

    # Log Audit Event
    log_audit(
        db,
        action="DEMO_BOOTSTRAPPED",
        entity_type="SYSTEM",
        entity_id=camp.id,
        summary=f"Bootstrapped synthetic demo campaign '{camp.name}' with 2,000 tasks and 16 workers.",
    )

    sla = evaluate_campaign_sla(db, camp.id, operational_date=today_date)
    deliv = evaluate_delivery_readiness(db, camp.id)

    return {
        "status": "DEMO_INITIALIZED",
        "campaign_id": camp.id,
        "provenance": get_demo_provenance_metadata(),
        "sla_status": sla["status"],
        "delivery_status": deliv["status"],
        "tasks_seeded": 2000,
        "workers_seeded": 16,
    }


def reset_demo_scenario(db: Session) -> dict:
    _purge_demo_entities(db)
    return _create_fresh_demo_scenario(db)


def bootstrap_demo_scenario(db: Session, force_recreate: bool = False) -> dict:
    existing_camp = db.query(Campaign).filter(
        or_(Campaign.id == DEMO_CAMPAIGN_ID, Campaign.name == DEMO_SCENARIO_NAME)
    ).first()

    if force_recreate:
        _purge_demo_entities(db)
        return _create_fresh_demo_scenario(db)

    if existing_camp:
        sla = evaluate_campaign_sla(db, existing_camp.id)
        deliv = evaluate_delivery_readiness(db, existing_camp.id)
        return {
            "status": "EXISTING_DEMO_ACTIVE",
            "campaign_id": existing_camp.id,
            "provenance": get_demo_provenance_metadata(),
            "sla_status": sla["status"],
            "delivery_status": deliv["status"],
        }

    return _create_fresh_demo_scenario(db)


def advance_demo_workday(db: Session, campaign_id: str = DEMO_CAMPAIGN_ID) -> dict:
    camp = db.query(Campaign).filter(
        or_(Campaign.id == campaign_id, Campaign.name == DEMO_SCENARIO_NAME)
    ).first()
    if not camp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    cid = camp.id

    # 1. Advance IN_PROGRESS tasks to SUBMITTED
    in_progress_tasks = (
        db.query(Task)
        .filter(Task.campaign_id == cid, Task.state == "IN_PROGRESS")
        .limit(100)
        .all()
    )
    advanced_to_submitted = 0
    for t in in_progress_tasks:
        transition_task_state(db, t, "SUBMITTED", reason="Demo Workday Advancement")
        advanced_to_submitted += 1

    # 2. Execute QA Sampling for SUBMITTED tasks
    sample_res = process_review_sampling_for_submitted_tasks(db, cid)

    # 3. Submit QA Reviews for IN_REVIEW tasks
    in_review_tasks = (
        db.query(Task)
        .filter(Task.campaign_id == cid, Task.state == "IN_REVIEW")
        .limit(50)
        .all()
    )
    reviewer = db.query(Worker).filter(Worker.role == "REVIEWER", Worker.is_active == True).first()

    accepted_count = 0
    rework_count = 0

    if reviewer:
        for idx, t in enumerate(in_review_tasks):
            verdict = "ACCEPT" if idx % 5 != 0 else "REWORK"
            reason = None if verdict == "ACCEPT" else "GUIDELINE_AMBIGUITY"

            try:
                submit_review(db, data=ReviewCreate(
                    task_id=t.id,
                    reviewer_id=reviewer.id,
                    verdict=verdict,
                    reason_code=reason,
                    comment=f"Demo automated QA review ({verdict})",
                ))
                if verdict == "ACCEPT":
                    accepted_count += 1
                else:
                    rework_count += 1
            except HTTPException:
                pass

    log_audit(
        db,
        action="DEMO_WORKDAY_ADVANCED",
        entity_type="CAMPAIGN",
        entity_id=cid,
        summary=f"Advanced demo workday: {advanced_to_submitted} tasks submitted, {accepted_count} QA accepted, {rework_count} rework requested.",
    )

    sla = evaluate_campaign_sla(db, cid)
    deliv = evaluate_delivery_readiness(db, cid)

    return {
        "campaign_id": cid,
        "advanced_to_submitted": advanced_to_submitted,
        "qa_sampled": sample_res["tasks_sent_to_review"],
        "unsampled_completed": sample_res["tasks_auto_completed"],
        "qa_accepted": accepted_count,
        "qa_rework": rework_count,
        "sla_status": sla["status"],
        "delivery_status": deliv["status"],
    }
