from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskBatchCreate(BaseModel):
    count: int = Field(..., gt=0, le=5000, description="Number of tasks to create")
    required_skill_tags: list[str] = Field(default_factory=list)
    priority: str | None = Field(None, pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    external_reference_prefix: str | None = Field(None, max_length=50)


class TaskStateUpdate(BaseModel):
    state: str = Field(..., pattern="^(UNASSIGNED|ASSIGNED|IN_PROGRESS|SUBMITTED|IN_REVIEW|ACCEPTED|REWORK_REQUIRED|BLOCKED|ESCALATED|COMPLETED)$")
    reason: str | None = Field(None, max_length=255)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    external_reference: str | None = None
    task_type: str
    priority: str
    state: str
    rework_count: int = 0
    assigned_worker_id: str | None = None
    allocation_id: str | None = None
    operational_date: date | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    completed_at: datetime | None = None
    required_skills: list[str] = Field(default_factory=list)
