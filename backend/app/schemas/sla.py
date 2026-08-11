from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SLAResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    campaign_id: str
    status: str  # ON_TRACK, AT_RISK, CRITICAL
    remaining_tasks: int
    remaining_working_days: int
    required_daily_rate: float
    available_capacity: int
    capacity_ratio: float
    review_backlog_ratio: float
    blocked_tasks: int
    open_critical_escalations: int
    reason_codes: list[str]
    evaluated_at: datetime
