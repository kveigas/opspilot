import math
from datetime import UTC, datetime

from app.models.audit import AuditLog
from app.models.campaign import Campaign
from app.models.escalation import Escalation
from app.models.review import Review
from app.models.task import Task
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def evaluate_delivery_readiness(db: Session, campaign_id: str) -> dict:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    now_utc = datetime.now(UTC)
    tasks = db.query(Task).filter(Task.campaign_id == campaign_id).all()
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.state == "COMPLETED")
    blocked_tasks = sum(1 for t in tasks if t.state == "BLOCKED")

    reviews = db.query(Review).filter(Review.campaign_id == campaign_id).all()
    completed_reviews_count = len(reviews)
    accepted_reviews_count = sum(1 for r in reviews if r.verdict == "ACCEPT")

    # Review requirement calculation
    sampling_pct = float(campaign.review_sampling_pct)
    required_review_count = math.ceil(total_tasks * (sampling_pct / 100.0))

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

    gates = []
    warnings = []
    blocking_reasons = []

    # Gate 1: VOLUME_COMPLETE
    vol_passed = (completed_tasks == int(campaign.total_volume)) and (total_tasks > 0)
    vol_reason = f"Completed {completed_tasks}/{campaign.total_volume} tasks."
    gates.append({
        "gate": "VOLUME_COMPLETE",
        "passed": vol_passed,
        "reason": vol_reason,
        "evidence": f"{completed_tasks}/{campaign.total_volume}",
    })
    if not vol_passed:
        blocking_reasons.append(f"Volume incomplete: {vol_reason}")

    # Gate 2: REVIEW_REQUIREMENT_COMPLETE
    rev_passed = (completed_reviews_count >= required_review_count)
    rev_reason = f"Completed {completed_reviews_count}/{required_review_count} required reviews ({sampling_pct}% target)."
    gates.append({
        "gate": "REVIEW_REQUIREMENT_COMPLETE",
        "passed": rev_passed,
        "reason": rev_reason,
        "evidence": f"{completed_reviews_count}/{required_review_count}",
    })
    if not rev_passed:
        blocking_reasons.append(f"Review requirement incomplete: {rev_reason}")

    # Gate 3: QUALITY_TARGET_MET
    target_qual = float(campaign.target_quality_pct)
    if completed_reviews_count == 0:
        qual_passed = (sampling_pct == 0.0)  # N/A if 0% sampling target
        qual_reason = "No reviews completed yet. INSUFFICIENT_QA_EVIDENCE." if sampling_pct > 0 else "0% sampling target (N/A)."
        qual_evidence = "0/0"
        if not qual_passed:
            warnings.append("Quality gate warning: INSUFFICIENT_QA_EVIDENCE.")
            blocking_reasons.append(f"Quality target failed: {qual_reason}")
    else:
        actual_qual = round((accepted_reviews_count / float(completed_reviews_count)) * 100.0, 1)
        qual_passed = (actual_qual >= target_qual)
        qual_reason = f"Operational QA acceptance rate {actual_qual}% (Target: {target_qual}%)."
        qual_evidence = f"{actual_qual}% vs {target_qual}%"
        if not qual_passed:
            blocking_reasons.append(f"Quality target failed: {qual_reason}")

    gates.append({
        "gate": "QUALITY_TARGET_MET",
        "passed": qual_passed,
        "reason": qual_reason,
        "evidence": qual_evidence,
    })

    # Gate 4: NO_CRITICAL_ESCALATIONS
    esc_passed = (open_critical_escalations == 0)
    esc_reason = f"Found {open_critical_escalations} open CRITICAL escalations."
    gates.append({
        "gate": "NO_CRITICAL_ESCALATIONS",
        "passed": esc_passed,
        "reason": esc_reason,
        "evidence": f"{open_critical_escalations} open",
    })
    if not esc_passed:
        blocking_reasons.append(f"Critical escalation blocking delivery: {esc_reason}")

    # Gate 5: NO_BLOCKED_TASKS
    block_passed = (blocked_tasks == 0)
    block_reason = f"Found {blocked_tasks} unresolved BLOCKED tasks."
    gates.append({
        "gate": "NO_BLOCKED_TASKS",
        "passed": block_passed,
        "reason": block_reason,
        "evidence": f"{blocked_tasks} blocked",
    })
    if not block_passed:
        blocking_reasons.append(f"Blocked tasks present: {block_reason}")

    # Overall Status Determination
    mandatory_gates_pass = vol_passed and rev_passed and qual_passed and esc_passed and block_passed

    if mandatory_gates_pass:
        if warnings:
            overall_status = "READY_WITH_WARNINGS"
        else:
            overall_status = "READY"
    else:
        overall_status = "NOT_READY"

    # Audit logging
    log_audit(
        db,
        action="DELIVERY_CHECK_RUN",
        entity_type="CAMPAIGN_DELIVERY",
        entity_id=campaign_id,
        summary=f"Evaluated delivery readiness for campaign '{campaign.name}': Status={overall_status}.",
    )

    last_audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "CAMPAIGN_DELIVERY",
            AuditLog.entity_id == campaign_id,
            AuditLog.action == "DELIVERY_STATUS_CHANGED",
        )
        .order_by(AuditLog.created_at.desc())
        .first()
    )

    prev_delivery_status = last_audit.summary.split("Status: ")[-1].split(" ")[0] if (last_audit and "Status: " in last_audit.summary) else None

    if prev_delivery_status != overall_status:
        log_audit(
            db,
            action="DELIVERY_STATUS_CHANGED",
            entity_type="CAMPAIGN_DELIVERY",
            entity_id=campaign_id,
            summary=f"Delivery readiness status for campaign '{campaign.name}' changed to Status: {overall_status}.",
        )

    return {
        "campaign_id": campaign_id,
        "status": overall_status,
        "evaluated_at": now_utc,
        "gates": gates,
        "warnings": warnings,
        "blocking_reasons": blocking_reasons,
    }
