
from app.database import get_db
from app.schemas.audit import AuditLogResponse
from app.services.audit_service import get_audit_logs
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=list[AuditLogResponse])
def api_get_audit_logs(
    limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)
):
    logs = get_audit_logs(db, limit=limit)
    return [
        AuditLogResponse(
            id=l.id,
            actor=l.actor,
            action=l.action,
            entity_type=l.entity_type,
            entity_id=l.entity_id,
            summary=l.summary,
            created_at=l.created_at,
        )
        for l in logs
    ]
