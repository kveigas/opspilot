from datetime import datetime

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: str
    actor: str
    action: str
    entity_type: str
    entity_id: str
    summary: str
    created_at: datetime

    class Config:
        from_attributes = True
