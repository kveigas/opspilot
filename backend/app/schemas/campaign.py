from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class CampaignBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    client_name: str = Field(..., min_length=2, max_length=120)
    task_type: str = Field(..., description="TEXT_ANNOTATION, PREFERENCE_RANKING, etc.")
    description: str | None = Field(None, max_length=1000)
    total_volume: int = Field(..., gt=0)
    target_quality_pct: float = Field(95.0, ge=50.0, le=100.0)
    review_sampling_pct: float = Field(20.0, ge=0.0, le=100.0)
    target_daily_throughput: int = Field(..., gt=0)
    start_date: date
    due_date: date
    priority: str = Field("MEDIUM", pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    calibration_required: bool = True
    required_annotators: int = Field(1, ge=1)
    required_reviewers: int = Field(0, ge=0)
    required_skills: list[str] = Field(default_factory=list)

    @field_validator("due_date")
    @classmethod
    def validate_dates(cls, v: date, info) -> date:
        start_date = info.data.get("start_date")
        if start_date and v <= start_date:
            raise ValueError("due_date must be strictly greater than start_date")
        return v


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = Field(None, pattern="^(DRAFT|ACTIVE|PAUSED|COMPLETED|DELIVERED|ARCHIVED)$")
    priority: str | None = Field(None, pattern="^(LOW|MEDIUM|HIGH|URGENT)$")
    target_daily_throughput: int | None = Field(None, gt=0)
    required_annotators: int | None = Field(None, ge=1)
    required_reviewers: int | None = Field(None, ge=0)


class CampaignResponse(CampaignBase):
    id: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
