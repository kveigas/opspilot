from datetime import UTC, date, datetime, timedelta

from app.models.audit import AuditLog
from app.models.campaign import Campaign
from app.models.capacity import WorkerDailyCapacity
from app.models.escalation import Escalation
from app.models.task import Task
from app.models.worker import Worker
from app.services.audit_service import log_audit
from app.services.qualification_helper import is_worker_qualified_for_campaign
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def calculate_working_days(start: date, end: date) -> int:
    if end < start:
        return 0
    working_days = 0
    curr = start
    while curr <= end:
        if curr.weekday() < 5:  # Monday to Friday
            working_days += 1
        curr += timedelta(days=1)
    return working_days


def evaluate_campaign_sla(db: Session, campaign_id: str, operational_date: date | None = None) -> dict:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    now_utc = datetime.now(UTC)
    today_date = operational_date or now_utc.date()

    tasks = db.query(Task).filter(Task.campaign_id == campaign_id).all()
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.state == "COMPLETED")
    remaining_tasks = total_tasks - completed_tasks
    blocked_tasks = sum(1 for t in tasks if t.state == "BLOCKED")

    # Working days remaining
    working_days_remaining = calculate_working_days(today_date, campaign.due_date)

    # Required daily rate
    if remaining_tasks == 0:
        required_daily_rate = 0.0
    else:
        denom = max(1, working_days_remaining)
        required_daily_rate = round(remaining_tasks / float(denom), 2)

    # Available capacity calculation for eligible production workers on operational_date
    active_workers = (
        db.query(Worker)
        .filter(
            Worker.is_active == True,
            Worker.availability == "AVAILABLE",
            Worker.role == "ANNOTATOR",
        )
        .all()
    )

    campaign_skills = {s.skill_tag.lower().strip() for s in campaign.skills}

    available_capacity = 0
    for w in active_workers:
        w_skills = {s.skill_tag.lower().strip() for s in w.skills}
        if not campaign_skills.issubset(w_skills):
            continue
        if not is_worker_qualified_for_campaign(db, w, campaign):
            continue

        cap = (
            db.query(WorkerDailyCapacity)
            .filter(
                WorkerDailyCapacity.worker_id == w.id,
                WorkerDailyCapacity.capacity_date == today_date,
            )
            .first()
        )
        if cap:
            available_capacity += max(0, cap.remaining_capacity_for_date)
        else:
            available_capacity += int(w.default_max_daily_capacity)

    # Capacity ratio
    if required_daily_rate == 0.0:
        capacity_ratio = 999.0  # Completed or zero rate required
    else:
        capacity_ratio = round(available_capacity / required_daily_rate, 2)

    # Review backlog ratio calculation
    submitted_review_eligible = sum(1 for t in tasks if t.state in ["SUBMITTED", "IN_REVIEW"])
    unreviewed = sum(1 for t in tasks if t.state == "SUBMITTED")

    if submitted_review_eligible == 0:
        review_backlog_ratio = 0.0
    else:
        review_backlog_ratio = round(unreviewed / float(submitted_review_eligible), 2)

    # Open critical escalations
    open_critical_escalations = (
        db.query(Escalation)
        .filter(
            Escalation.campaign_id == campaign_id,
            Escalation.severity == "CRITICAL",
            Escalation.status.in_(["OPEN", "INVESTIGATING", "WAITING"]),
        )
        .count()
    )

    # Status Determination & Reason Code Aggregation
    statuses = ["ON_TRACK"]
    reason_codes = set()

    # Base capacity classification
    if remaining_tasks > 0:
        if capacity_ratio >= 1.10:
            pass  # ON_TRACK
        elif 0.85 <= capacity_ratio < 1.10:
            statuses.append("AT_RISK")
            reason_codes.add("CAPACITY_BUFFER_LOW")
        else:  # capacity_ratio < 0.85
            statuses.append("CRITICAL")
            reason_codes.add("INSUFFICIENT_CAPACITY")

        if capacity_ratio < 1.00:
            reason_codes.add("INSUFFICIENT_CAPACITY")

    # Override 1: Overdue
    if today_date > campaign.due_date and remaining_tasks > 0:
        statuses.append("CRITICAL")
        reason_codes.add("CAMPAIGN_OVERDUE")

    # Override 2: Zero Capacity
    if available_capacity == 0 and remaining_tasks > 0:
        statuses.append("CRITICAL")
        reason_codes.add("ZERO_ELIGIBLE_CAPACITY")

    # Override 3: Critical Escalations
    if open_critical_escalations > 0:
        statuses.append("CRITICAL")
        reason_codes.add("CRITICAL_ESCALATION_OPEN")

    # Override 4: Review Backlog
    if review_backlog_ratio > 0.50:
        statuses.append("CRITICAL")
        reason_codes.add("REVIEW_BACKLOG_CRITICAL")
    elif review_backlog_ratio > 0.25:
        statuses.append("AT_RISK")
        reason_codes.add("REVIEW_BACKLOG_HIGH")

    # Override 5: Blocked Tasks
    if blocked_tasks > 15:
        statuses.append("CRITICAL")
        reason_codes.add("BLOCKER_VOLUME_CRITICAL")
    elif blocked_tasks > 5:
        statuses.append("AT_RISK")
        reason_codes.add("BLOCKER_VOLUME_HIGH")

    # Aggregate highest severity
    if "CRITICAL" in statuses:
        final_status = "CRITICAL"
    elif "AT_RISK" in statuses:
        final_status = "AT_RISK"
    else:
        final_status = "ON_TRACK"

    # Emit SLA_STATUS_CHANGED audit event if status changed since last evaluation
    last_audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "CAMPAIGN_SLA",
            AuditLog.entity_id == campaign_id,
        )
        .order_by(AuditLog.created_at.desc())
        .first()
    )

    prev_status = last_audit.summary.split("Status: ")[-1].split(" ")[0] if (last_audit and "Status: " in last_audit.summary) else None

    if prev_status != final_status:
        log_audit(
            db,
            action="SLA_STATUS_CHANGED",
            entity_type="CAMPAIGN_SLA",
            entity_id=campaign_id,
            summary=f"SLA status for campaign '{campaign.name}' changed to Status: {final_status}. Reasons: {list(reason_codes)}.",
        )

    return {
        "campaign_id": campaign_id,
        "status": final_status,
        "remaining_tasks": remaining_tasks,
        "remaining_working_days": working_days_remaining,
        "required_daily_rate": required_daily_rate,
        "available_capacity": available_capacity,
        "capacity_ratio": capacity_ratio,
        "review_backlog_ratio": review_backlog_ratio,
        "blocked_tasks": blocked_tasks,
        "open_critical_escalations": open_critical_escalations,
        "reason_codes": sorted(reason_codes),
        "evaluated_at": now_utc,
    }
