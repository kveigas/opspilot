from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class AllocationTriggerRequest(BaseModel):
    campaign_id: str
    operational_date: date
    max_tasks_to_allocate: int | None = Field(None, gt=0)


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
