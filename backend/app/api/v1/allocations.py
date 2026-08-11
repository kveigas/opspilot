import json

from app.database import get_db
from app.models.allocation import Allocation
from app.schemas.allocation import (
    AllocationResponse,
    AllocationRunResponse,
    AllocationTriggerRequest,
)
from app.services.allocation_service import release_allocation, trigger_allocation_run
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/allocations", tags=["Allocations"])


@router.post("/trigger", response_model=AllocationRunResponse, status_code=201)
def api_trigger_allocation(
    data: AllocationTriggerRequest, db: Session = Depends(get_db)
):
    run = trigger_allocation_run(
        db,
        campaign_id=data.campaign_id,
        operational_date=data.operational_date,
        max_tasks_to_allocate=data.max_tasks_to_allocate,
    )

    reasons = json.loads(run.unallocated_reasons_json or "{}")

    return AllocationRunResponse(
        allocation_run_id=run.id,
        campaign_id=run.campaign_id,
        operational_date=run.operational_date,
        tasks_considered=run.tasks_considered,
        tasks_allocated=run.tasks_allocated,
        tasks_unallocated=run.tasks_unallocated,
        workers_used=run.workers_used,
        capacity_consumed=run.capacity_consumed,
        unallocated_reason_counts=reasons,
        created_at=run.created_at,
    )


@router.get("", response_model=list[AllocationResponse])
def api_list_allocations(
    campaign_id: str | None = Query(None),
    worker_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    query = db.query(Allocation)
    if campaign_id:
        query = query.filter(Allocation.campaign_id == campaign_id)
    if worker_id:
        query = query.filter(Allocation.worker_id == worker_id)
    if status_filter:
        query = query.filter(Allocation.status == status_filter)

    allocs = list(query.order_by(Allocation.allocated_at.desc()).all())

    return [
        AllocationResponse(
            id=a.id,
            allocation_run_id=a.allocation_run_id,
            campaign_id=a.campaign_id,
            task_id=a.task_id,
            worker_id=a.worker_id,
            operational_date=a.operational_date,
            allocated_at=a.allocated_at,
            deallocated_at=a.deallocated_at,
            status=a.status,
            reason=a.reason,
        )
        for a in allocs
    ]


@router.post("/{allocation_id}/release", response_model=AllocationResponse)
def api_release_allocation(
    allocation_id: str,
    reason: str | None = Query("MANUAL_RELEASE"),
    db: Session = Depends(get_db),
):
    alloc = release_allocation(db, allocation_id, reason=reason)
    return AllocationResponse(
        id=alloc.id,
        allocation_run_id=alloc.allocation_run_id,
        campaign_id=alloc.campaign_id,
        task_id=alloc.task_id,
        worker_id=alloc.worker_id,
        operational_date=alloc.operational_date,
        allocated_at=alloc.allocated_at,
        deallocated_at=alloc.deallocated_at,
        status=alloc.status,
        reason=alloc.reason,
    )
