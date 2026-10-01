from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    id: str
    actor: str
    action: str
    entity_type: str
    entity_id: str
    summary: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
