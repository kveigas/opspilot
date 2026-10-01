from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AllocationTriggerRequest(BaseModel):
    campaign_id: str
    # Defaults to the campaign's operational date (simulation clock for demo campaigns).
    operational_date: date | None = None
    max_tasks_to_allocate: int | None = Field(None, gt=0)
    strategy: str = Field("BALANCED", pattern="^(BALANCED|QUALITY_AWARE)$")


class AllocationRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    allocation_run_id: str
    campaign_id: str
    operational_date: date
    tasks_considered: int
    tasks_allocated: int
    tasks_unallocated: int
    workers_used: int
    capacity_consumed: int
    unallocated_reason_counts: dict[str, int]
    created_at: datetime
    strategy: str = "BALANCED"


class AllocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    allocation_run_id: str
    campaign_id: str
    task_id: str
    worker_id: str
    operational_date: date
    allocated_at: datetime
    deallocated_at: datetime | None = None
    status: str
    reason: str | None = None
