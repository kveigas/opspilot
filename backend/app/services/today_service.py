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

    for c in campaigns:
        sla = evaluate_campaign_sla(db, c.id)
        if sla["status"] == "CRITICAL":
            critical_campaigns.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "reason_codes": sla["reason_codes"],
                "capacity_ratio": sla["capacity_ratio"],
            })
        elif sla["status"] == "AT_RISK":
            at_risk_campaigns.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "reason_codes": sla["reason_codes"],
                "capacity_ratio": sla["capacity_ratio"],
            })

        deliv = evaluate_delivery_readiness(db, c.id)
        if deliv["status"] in ["READY", "READY_WITH_WARNINGS"]:
            delivery_candidates.append({
                "campaign_id": c.id,
                "campaign_name": c.name,
                "status": deliv["status"],
                "warnings": deliv["warnings"],
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
        "critical_campaigns": critical_campaigns,
        "at_risk_campaigns": at_risk_campaigns,
        "critical_escalations": critical_escalations,
        "review_backlogs": review_backlogs,
        "blocked_work": blocked_work,
        "rework_items": rework_items,
        "delivery_candidates": delivery_candidates,
    }
