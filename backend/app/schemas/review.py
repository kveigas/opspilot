from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    task_id: str
    reviewer_id: str
    verdict: str = Field(..., pattern="^(ACCEPT|REWORK|BLOCK|ESCALATE)$")
    reason_code: str | None = Field(None, pattern="^(LABEL_ERROR|GUIDELINE_AMBIGUITY|INCOMPLETE_WORK|FORMAT_ERROR|TOOLING_ISSUE|POLICY_QUESTION|OTHER)$")
    comment: str | None = Field(None, max_length=1000)


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    campaign_id: str
    reviewer_id: str
    verdict: str
    reason_code: str | None = None
    comment: str | None = None
    created_at: datetime
    updated_at: datetime
