from datetime import UTC, date, datetime, timedelta

from app.models.allocation import Allocation, AllocationRun
from app.models.calibration import CalibrationResult, CalibrationRound
from app.models.campaign import Campaign, CampaignSkill
from app.models.capacity import WorkerDailyCapacity
from app.models.escalation import Escalation
from app.models.ops import SimulationClock
from app.models.review import Review
from app.models.task import Task, TaskSkill
from app.models.worker import Worker, WorkerQualification, WorkerSkill
from app.schemas.review import ReviewCreate
from app.services.audit_service import log_audit
from app.services.clock_service import advance_simulation_clock, get_operational_date, set_simulation_clock
from app.services.delivery_service import evaluate_delivery_readiness
from app.services.review_service import process_review_sampling_for_submitted_tasks, submit_review
from app.services.sla_service import evaluate_campaign_sla
from app.services.stats import stable_unit_interval
from app.services.transaction import atomic
from app.services.transition_service import transition_task_state
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

DEMO_CAMPAIGN_ID = "demo-campaign-ai-eval"
DEMO_SCENARIO_NAME = "Multilingual AI Response Evaluation"
DEMO_SEED_ID = "SEED_OPSPILOT_DEMO_2026"
DEMO_SCENARIO_VERSION = "2.0.0"
DEMO_START_DATE = date(2026, 8, 11)
DEMO_REVIEWER_ID = "demo-worker-rev-01"
HISTORICAL_REVIEWS_PER_ANNOTATOR = 36

# Synthetic ground truth for the demo only: each annotator's probability that QA accepts a
# task first time. Unknown to the QA engine, which must infer quality from verdicts.
DEMO_LATENT_ACCURACY = {
    "demo-worker-ann-01": 0.99,
    "demo-worker-ann-02": 0.985,
    "demo-worker-ann-03": 0.98,
    "demo-worker-ann-04": 0.975,
    "demo-worker-ann-05": 0.97,
    "demo-worker-ann-06": 0.965,
    "demo-worker-ann-07": 0.95,
    "demo-worker-ann-08": 0.90,
    "demo-worker-ann-09": 0.84,
    "demo-worker-ann-10": 0.95,
    "demo-worker-ann-11": 0.80,
    "demo-worker-ann-12": 0.97,
}


def get_demo_provenance_metadata() -> dict:
    return {
        "scenario_name": DEMO_SCENARIO_NAME,
        "scenario_version": DEMO_SCENARIO_VERSION,
        "seed_identifier": DEMO_SEED_ID,
        "synthetic": True,
        "environment": "public_demo",
        "simulation_start_date": DEMO_START_DATE.isoformat(),
        "notes": [
            "Annotator quality, QA verdicts and workday progress are synthetic and deterministic.",
            "The campaign follows a simulation clock so fixed demo dates do not age against the real calendar.",
        ],
    }


def _simulated_verdict(task: Task) -> tuple[str, str | None]:
    accuracy = DEMO_LATENT_ACCURACY.get(str(task.assigned_worker_id), 0.95)
    draw = stable_unit_interval(DEMO_SEED_ID, "verdict", str(task.id), str(task.rework_count))
    return ("ACCEPT", None) if draw < accuracy else ("REWORK", "LABEL_ERROR")


def _purge_demo_entities(db: Session):
    demo_camps = db.query(Campaign).filter(
        Campaign.id == DEMO_CAMPAIGN_ID
    ).all()

    for demo_camp in demo_camps:
        db.query(Review).filter(Review.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(Escalation).filter(Escalation.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(Allocation).filter(Allocation.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(AllocationRun).filter(AllocationRun.campaign_id == demo_camp.id).delete(synchronize_session=False)
        task_ids = db.query(Task.id).filter(Task.campaign_id == demo_camp.id).scalar_subquery()
        db.query(TaskSkill).filter(TaskSkill.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(CampaignSkill).filter(CampaignSkill.campaign_id == demo_camp.id).delete(synchronize_session=False)

        demo_rounds = db.query(CalibrationRound).filter(CalibrationRound.campaign_id == demo_camp.id).all()
        for r in demo_rounds:
            db.query(CalibrationResult).filter(CalibrationResult.round_id == r.id).delete(synchronize_session=False)
        db.query(CalibrationRound).filter(CalibrationRound.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.query(SimulationClock).filter(SimulationClock.campaign_id == demo_camp.id).delete(synchronize_session=False)
        db.delete(demo_camp)

    demo_worker_ids = ([f"demo-worker-ann-{i:02d}" for i in range(1, 13)]
                       + [f"demo-worker-rev-{i:02d}" for i in range(1, 4)]
                       + ["demo-worker-lead-01"])
    demo_workers = db.query(Worker).filter(Worker.id.in_(demo_worker_ids)).all()
    for w in demo_workers:
        db.query(WorkerSkill).filter(WorkerSkill.worker_id == w.id).delete(synchronize_session=False)
        db.query(WorkerQualification).filter(WorkerQualification.worker_id == w.id).delete(synchronize_session=False)
        db.query(WorkerDailyCapacity).filter(WorkerDailyCapacity.worker_id == w.id).delete(synchronize_session=False)
        db.delete(w)

    db.flush()


def _seed_historical_qa(db: Session, tasks: list[Task], now_utc: datetime) -> int:
    """Early-campaign QA history on completed work, so annotator trust starts from evidence."""
    by_worker: dict[str, list[Task]] = {}
    for t in tasks:
        if t.state == "COMPLETED" and t.assigned_worker_id:
            by_worker.setdefault(str(t.assigned_worker_id), []).append(t)
    history_time = now_utc - timedelta(days=5)
    seeded = 0
    for worker_id in sorted(by_worker):
        completed = sorted(by_worker[worker_id], key=lambda t: stable_unit_interval(DEMO_SEED_ID, "history", t.id))
        reviewed = completed[:HISTORICAL_REVIEWS_PER_ANNOTATOR]
        probability = len(reviewed) / len(completed)
        for t in completed:
            t.qa_sample_probability = probability
            t.qa_sampling_tier = "HISTORICAL"
        for t in reviewed:
            verdict, reason = _simulated_verdict(t)
            if verdict == "REWORK":
                t.rework_count = 1  # Corrected before completion.
            db.add(Review(
                task_id=t.id, campaign_id=t.campaign_id, reviewer_id=DEMO_REVIEWER_ID, verdict=verdict,
                reason_code=reason, comment="Synthetic early-campaign QA history",
                created_at=history_time, updated_at=history_time,
            ))
            seeded += 1
    db.flush()
    return seeded


def _create_fresh_demo_scenario(db: Session) -> dict:
    now_utc = datetime.now(UTC)
    today_date = DEMO_START_DATE

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
        qa_policy="ADAPTIVE",
        created_at=now_utc,
    )
    db.add(camp)
    db.flush()
    set_simulation_clock(db, camp.id, today_date)

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
            elif w.role in ["ANNOTATOR", "REVIEWER"]:
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
    historical_reviews = _seed_historical_qa(db, tasks, now_utc)

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

    db.flush()

    # Log Audit Event
    log_audit(
        db,
        action="DEMO_BOOTSTRAPPED",
        entity_type="SYSTEM",
        entity_id=camp.id,
        summary=(
            f"Bootstrapped synthetic demo campaign '{camp.name}' with 2,000 tasks, 16 workers and "
            f"{historical_reviews} historical QA verdicts. Simulation clock set to {today_date}."
        ),
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
        "historical_reviews_seeded": historical_reviews,
        "operational_date": today_date,
    }


@atomic
def reset_demo_scenario(db: Session) -> dict:
    _purge_demo_entities(db)
    return _create_fresh_demo_scenario(db)


@atomic
def bootstrap_demo_scenario(db: Session, force_recreate: bool = False) -> dict:
    existing_camp = db.query(Campaign).filter(
        Campaign.id == DEMO_CAMPAIGN_ID
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


@atomic
def advance_demo_workday(db: Session, campaign_id: str = DEMO_CAMPAIGN_ID) -> dict:
    if campaign_id != DEMO_CAMPAIGN_ID:
        raise HTTPException(400, "Demo automation can only advance the synthetic demo campaign.")
    camp = db.query(Campaign).filter(
        Campaign.id == campaign_id
    ).first()
    if not camp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    cid = camp.id

    # 0. Unblock BLOCKED tasks if no open critical escalations exist
    open_critical = (
        db.query(Escalation)
        .filter(
            Escalation.campaign_id == cid,
            Escalation.severity == "CRITICAL",
            Escalation.status.in_(["OPEN", "INVESTIGATING", "WAITING"]),
        )
        .count()
    )
    if open_critical == 0:
        blocked_tasks = db.query(Task).filter(Task.campaign_id == cid, Task.state == "BLOCKED").limit(200).all()
        for t in blocked_tasks:
            transition_task_state(db, t, "IN_PROGRESS", reason="Escalation Resolved - Unblocked")

        escalated_tasks = db.query(Task).filter(Task.campaign_id == cid, Task.state == "ESCALATED").limit(200).all()
        for t in escalated_tasks:
            transition_task_state(db, t, "IN_PROGRESS", reason="Escalation Resolved - Restored to Production")

    # 0b. Advance ASSIGNED tasks to IN_PROGRESS. Allocation already bounded assignments by each
    # annotator's capacity for the day, so the demo does not impose a second, artificial cap
    # (an arbitrary cap made the capacity-based forecast and SLA disagree with the demo).
    assigned_tasks = (
        db.query(Task)
        .filter(Task.campaign_id == cid, Task.state == "ASSIGNED")
        .order_by(Task.id.asc())
        .all()
    )
    for t in assigned_tasks:
        transition_task_state(db, t, "IN_PROGRESS", reason="Demo Workday Production Start")

    # 1. Advance IN_PROGRESS tasks to SUBMITTED
    in_progress_tasks = (
        db.query(Task)
        .filter(Task.campaign_id == cid, Task.state == "IN_PROGRESS")
        .order_by(Task.id.asc())
        .all()
    )
    advanced_to_submitted = 0
    for t in in_progress_tasks:
        transition_task_state(db, t, "SUBMITTED", reason="Demo Workday Advancement")
        advanced_to_submitted += 1

    # 2. Execute QA Sampling for SUBMITTED tasks
    sample_res = process_review_sampling_for_submitted_tasks(db, cid)

    # 3. Submit QA Reviews for IN_REVIEW tasks, up to the reviewers' combined daily capacity.
    reviewer_capacity = sum(
        int(w.default_max_daily_capacity)
        for w in db.query(Worker).filter(
            Worker.role == "REVIEWER", Worker.is_active.is_(True), Worker.availability == "AVAILABLE"
        )
    )
    in_review_tasks = (
        db.query(Task)
        .filter(Task.campaign_id == cid, Task.state == "IN_REVIEW")
        .order_by(Task.id.asc())
        .limit(reviewer_capacity)
        .all()
    )
    qual_revs = (
        db.query(WorkerQualification)
        .filter(
            WorkerQualification.campaign_id == cid,
            WorkerQualification.status == "PASSED",
        )
        .all()
    )
    qual_worker_ids = [q.worker_id for q in qual_revs]
    reviewer = db.query(Worker).filter(Worker.id.in_(qual_worker_ids), Worker.role == "REVIEWER").first()

    accepted_count = 0
    rework_count = 0

    if reviewer:
        for t in in_review_tasks:
            # Synthetic reviewer verdict from the annotator's hidden demo accuracy.
            verdict, reason = _simulated_verdict(t)

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

    worked_date = get_operational_date(db, cid)
    clock = advance_simulation_clock(db, cid) if db.get(SimulationClock, cid) else None

    log_audit(
        db,
        action="DEMO_WORKDAY_ADVANCED",
        entity_type="CAMPAIGN",
        entity_id=cid,
        summary=(
            f"Advanced demo workday {worked_date}: {advanced_to_submitted} tasks submitted, "
            f"{sample_res['tasks_sent_to_review']} sampled for QA ({sample_res.get('qa_policy', 'FLAT')}), "
            f"{accepted_count} QA accepted, {rework_count} rework requested."
        ),
    )

    sla = evaluate_campaign_sla(db, cid)
    deliv = evaluate_delivery_readiness(db, cid)

    return {
        "campaign_id": cid,
        "worked_date": worked_date,
        "operational_date": clock.operational_date if clock else worked_date,
        "advanced_to_submitted": advanced_to_submitted,
        "qa_policy": sample_res.get("qa_policy"),
        "qa_sampled": sample_res["tasks_sent_to_review"],
        "qa_sampled_by_tier": sample_res.get("sent_to_review_by_tier", {}),
        "unsampled_completed": sample_res["tasks_auto_completed"],
        "qa_accepted": accepted_count,
        "qa_rework": rework_count,
        "sla_status": sla["status"],
        "delivery_status": deliv["status"],
    }
