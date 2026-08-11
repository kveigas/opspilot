from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DeliveryGateResult(BaseModel):
    gate: str
    passed: bool
    reason: str
    evidence: str | None = None


class DeliveryReadinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    campaign_id: str
    status: str  # READY, READY_WITH_WARNINGS, NOT_READY
    evaluated_at: datetime
    gates: list[DeliveryGateResult]
    warnings: list[str]
    blocking_reasons: list[str]
