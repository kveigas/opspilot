from datetime import datetime

from pydantic import BaseModel, Field


class CalibrationRoundCreate(BaseModel):
    campaign_id: str
    domain_tag: str = Field(..., min_length=2, max_length=50)
    total_test_tasks: int = Field(10, gt=0)
    pass_threshold_pct: float = Field(90.0, ge=0.0, le=100.0)
    max_allowed_attempts: int = Field(2, ge=1)


class CalibrationResultCreate(BaseModel):
    worker_id: str
    score_pct: float = Field(..., ge=0.0, le=100.0)


class CalibrationResultResponse(BaseModel):
    id: str
    round_id: str
    worker_id: str
    score_pct: float
    passed: bool
    attempt_number: int
    evaluated_at: datetime

    class Config:
        from_attributes = True


class CalibrationRoundResponse(BaseModel):
    id: str
    campaign_id: str
    domain_tag: str
    total_test_tasks: int
    pass_threshold_pct: float
    max_allowed_attempts: int
    status: str
    created_at: datetime
    results: list[CalibrationResultResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
