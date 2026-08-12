from datetime import UTC, datetime

from app.models.campaign import Campaign
from app.models.escalation import Escalation
from app.models.task import Task
from app.services.delivery_service import evaluate_delivery_readiness
from app.services.sla_service import evaluate_campaign_sla
from sqlalchemy.orm import Session


def get_today_manager_cockpit(db: Session) -> dict:
    campaigns = db.query(Campaign).filter(Campaign.status == "ACTIVE").all()

    critical_campaigns = []
    at_risk_campaigns = []
    delivery_candidates = []
    unallocated_backlog_summary = []
    qa_review_backlog_summary = []

    for c in campaigns:
        sla = evaluate_campaign_sla(db, c.id)
        delivery = evaluate_delivery_readiness(db, c.id)
        unallocated_count = db.query(Task).filter(Task.campaign_id == c.id, Task.state == "UNASSIGNED").count()
        submitted_count = db.query(Task).filter(Task.campaign_id == c.id, Task.state == "SUBMITTED").count()
        in_review_count = db.query(Task).filter(Task.campaign_id == c.id, Task.state == "IN_REVIEW").count()
        rework_count = db.query(Task).filter(Task.campaign_id == c.id, Task.rework_count > 0, Task.state != "COMPLETED").count()

        campaign_summary = {
            "campaign_id": c.id,
            "name": c.name,
            "campaign_name": c.name,
            "sla_status": sla["status"],
            "delivery_status": delivery["status"],
            "reason_codes": sla["reason_codes"],
            "primary_reason_code": sla["reason_codes"][0] if sla["reason_codes"] else None,
            "available_capacity": sla["available_capacity"],
            "capacity_ratio": sla["capacity_ratio"],
            "blocked_count": sla["blocked_tasks"],
            "open_critical_escalation_count": sla["open_critical_escalations"],
            "unallocated_count": unallocated_count,
            "review_backlog_count": submitted_count + in_review_count,
            "rework_count": rework_count,
        }

        if sla["status"] == "CRITICAL":
            critical_campaigns.append(campaign_summary)
        elif sla["status"] == "AT_RISK":
            at_risk_campaigns.append(campaign_summary)

        if delivery["status"] in ["READY", "READY_WITH_WARNINGS"]:
            delivery_candidates.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "status": delivery["status"],
                "warnings": delivery["warnings"],
            })

        if unallocated_count > 0:
            unallocated_backlog_summary.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "unallocated_count": unallocated_count,
            })

        if submitted_count + in_review_count > 0:
            qa_review_backlog_summary.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "submitted_count": submitted_count,
                "in_review_count": in_review_count,
                "review_backlog_count": submitted_count + in_review_count,
            })

    # Critical Escalations
    critical_escalations_raw = (
        db.query(Escalation)
        .filter(
            Escalation.severity == "CRITICAL",
            Escalation.status.in_(["OPEN", "INVESTIGATING", "WAITING"]),
        )
        .order_by(Escalation.created_at.desc())
        .all()
    )
    critical_escalations = [
        {
            "id": e.id,
            "campaign_id": e.campaign_id,
            "title": e.title,
            "trigger_reason": e.title,
            "severity": e.severity,
            "category": e.category,
            "status": e.status,
            "created_at": e.created_at,
        }
        for e in critical_escalations_raw
    ]

    # Review Backlogs
    review_backlogs_raw = (
        db.query(Task)
        .filter(Task.state.in_(["SUBMITTED", "IN_REVIEW"]))
        .order_by(Task.created_at.asc())
        .all()
    )
    review_backlogs = [
        {
            "task_id": t.id,
            "campaign_id": t.campaign_id,
            "state": t.state,
            "submitted_at": t.submitted_at,
        }
        for t in review_backlogs_raw
    ]

    # Blocked Work
    blocked_tasks_raw = (
        db.query(Task)
        .filter(Task.state == "BLOCKED")
        .order_by(Task.updated_at.desc())
        .all()
    )
    blocked_work = [
        {
            "task_id": t.id,
            "campaign_id": t.campaign_id,
            "assigned_worker_id": t.assigned_worker_id,
            "updated_at": t.updated_at,
        }
        for t in blocked_tasks_raw
    ]

    # Rework Items
    rework_items_raw = (
        db.query(Task)
        .filter(Task.rework_count > 0, Task.state != "COMPLETED")
        .order_by(Task.rework_count.desc())
        .all()
    )
    rework_items = [
        {
            "task_id": t.id,
            "campaign_id": t.campaign_id,
            "rework_count": t.rework_count,
            "state": t.state,
        }
        for t in rework_items_raw
    ]

    return {
        "evaluated_at": datetime.now(UTC),
        "campaign_count": len(campaigns),
        "critical_campaigns": critical_campaigns,
        "at_risk_campaigns": at_risk_campaigns,
        "critical_escalations": critical_escalations,
        "open_escalations": critical_escalations,
        "review_backlogs": review_backlogs,
        "qa_review_backlog_summary": qa_review_backlog_summary,
        "blocked_work": blocked_work,
        "rework_items": rework_items,
        "unallocated_backlog_summary": unallocated_backlog_summary,
        "delivery_candidates": delivery_candidates,
    }
