
from app.models.audit import AuditLog
from sqlalchemy.orm import Session


def log_audit(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
    actor: str = "SYSTEM_MANAGER"
) -> AuditLog:
    entry = AuditLog(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        summary=summary,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_audit_logs(db: Session, limit: int = 100) -> list[AuditLog]:
    return list(db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all())
