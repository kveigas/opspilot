from datetime import datetime

from pydantic import BaseModel, Field


class WorkerBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., max_length=120)
    role: str = Field("ANNOTATOR", pattern="^(ANNOTATOR|REVIEWER|LEAD|MANAGER)$")
    timezone: str = Field("UTC", max_length=40)
    default_max_daily_capacity: int = Field(30, ge=0)
    availability: str = Field("AVAILABLE", pattern="^(AVAILABLE|BUSY|ON_LEAVE|INACTIVE|UNAVAILABLE)$")
    is_active: bool = True
    skills: list[str] = Field(default_factory=list)


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(BaseModel):
    name: str | None = None
    role: str | None = Field(None, pattern="^(ANNOTATOR|REVIEWER|LEAD|MANAGER)$")
    timezone: str | None = None
    default_max_daily_capacity: int | None = Field(None, ge=0)
    availability: str | None = Field(None, pattern="^(AVAILABLE|BUSY|ON_LEAVE|INACTIVE|UNAVAILABLE)$")
    is_active: bool | None = None
    skills: list[str] | None = None


class WorkerQualificationSummary(BaseModel):
    campaign_id: str
    status: str
    score: float | None = None
    attempts_used: int

    class Config:
        from_attributes = True


class WorkerResponse(WorkerBase):
    id: str
    created_at: datetime
    qualifications: list[WorkerQualificationSummary] = Field(default_factory=list)

    class Config:
        from_attributes = True
