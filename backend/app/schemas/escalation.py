from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EscalationCreate(BaseModel):
    campaign_id: str
    task_id: str | None = None
    owner_id: str | None = None
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=5)
    severity: str = Field("MEDIUM", pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    category: str = Field("QUALITY", pattern="^(GUIDELINE|QUALITY|CAPACITY|TOOLING|CLIENT_CLARIFICATION|DATA_ISSUE|SLA)$")
    blocker: bool = False
    due_at: datetime | None = None


class EscalationStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(OPEN|INVESTIGATING|WAITING|RESOLVED|CLOSED)$")
    owner_id: str | None = None
    resolution: str | None = Field(None, max_length=2000)
    target_task_state: str | None = Field(None, pattern="^(IN_PROGRESS|SUBMITTED|COMPLETED)$")


class EscalationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    task_id: str | None = None
    owner_id: str | None = None
    title: str
    description: str
    severity: str
    category: str
    status: str
    blocker: bool
    resolution: str | None = None
    created_at: datetime
    due_at: datetime | None = None
    resolved_at: datetime | None = None
