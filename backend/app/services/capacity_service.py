from datetime import date

from app.models.allocation import Allocation
from app.models.capacity import WorkerDailyCapacity
from app.models.worker import Worker
from app.schemas.capacity import CapacityCreate, CapacityUpdate
from app.services.audit_service import log_audit
from app.services.transaction import atomic
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def _validate_active_load(db: Session, worker_id: str, capacity_date: date, allocated: int) -> None:
    active = db.query(Allocation).filter(
        Allocation.worker_id == worker_id,
        Allocation.operational_date == capacity_date,
        Allocation.status == "ACTIVE",
    ).count()
    if allocated < active:
        raise HTTPException(409, "WORKER_ALLOCATION_CONFLICT: Release active allocations before reducing allocated load.")


@atomic
def get_or_create_capacity(db: Session, worker_id: str, capacity_date: date) -> WorkerDailyCapacity:
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker with id '{worker_id}' not found."
        )

    cap = (
        db.query(WorkerDailyCapacity)
        .filter(
            WorkerDailyCapacity.worker_id == worker_id,
            WorkerDailyCapacity.capacity_date == capacity_date,
        )
        .first()
    )

    if not cap:
        cap = WorkerDailyCapacity(
            worker_id=worker_id,
            capacity_date=capacity_date,
            max_daily_capacity=int(worker.default_max_daily_capacity),
            allocated_for_date=0,
        )
        db.add(cap)
        db.flush()

    return cap


@atomic
def upsert_capacity(db: Session, data: CapacityCreate) -> WorkerDailyCapacity:
    worker = db.query(Worker).filter(Worker.id == data.worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker with id '{data.worker_id}' not found."
        )

    if data.max_daily_capacity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_daily_capacity must be greater than 0."
        )

    if data.allocated_for_date > data.max_daily_capacity:
        raise HTTPException(400, "allocated_for_date cannot exceed max_daily_capacity.")

    if "allocated_for_date" in data.model_fields_set:
        _validate_active_load(db, data.worker_id, data.capacity_date, data.allocated_for_date)

    cap = (
        db.query(WorkerDailyCapacity)
        .filter(
            WorkerDailyCapacity.worker_id == data.worker_id,
            WorkerDailyCapacity.capacity_date == data.capacity_date,
        )
        .first()
    )

    if cap:
        if data.max_daily_capacity < cap.allocated_for_date:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"WORKER_ALLOCATION_CONFLICT: Cannot reduce max_daily_capacity to {data.max_daily_capacity}. "
                    f"Worker currently has {cap.allocated_for_date} active allocations for {data.capacity_date}. "
                    f"Required deallocations before capacity reduction: {cap.allocated_for_date - data.max_daily_capacity}."
                ),
            )
        cap.max_daily_capacity = data.max_daily_capacity
        if "allocated_for_date" in data.model_fields_set:
            cap.allocated_for_date = data.allocated_for_date
    else:
        if data.allocated_for_date > data.max_daily_capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="allocated_for_date cannot exceed max_daily_capacity."
            )
        cap = WorkerDailyCapacity(
            worker_id=data.worker_id,
            capacity_date=data.capacity_date,
            max_daily_capacity=data.max_daily_capacity,
            allocated_for_date=data.allocated_for_date,
        )
        db.add(cap)

    db.flush()

    log_audit(
        db,
        action="CAPACITY_UPDATED",
        entity_type="WORKER_CAPACITY",
        entity_id=str(cap.id),
        summary=f"Set date capacity for worker '{worker.name}' on {cap.capacity_date}: {cap.allocated_for_date}/{cap.max_daily_capacity}."
    )
    return cap


@atomic
def update_capacity(db: Session, capacity_id: str, data: CapacityUpdate) -> WorkerDailyCapacity:
    cap = db.query(WorkerDailyCapacity).filter(WorkerDailyCapacity.id == capacity_id).first()
    if not cap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Daily capacity record with id '{capacity_id}' not found."
        )

    if data.max_daily_capacity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_daily_capacity must be greater than 0."
        )

    if data.max_daily_capacity < cap.allocated_for_date:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"WORKER_ALLOCATION_CONFLICT: Cannot reduce max_daily_capacity to {data.max_daily_capacity}. "
                f"Worker currently has {cap.allocated_for_date} active allocations. "
                f"Required deallocations before reduction: {cap.allocated_for_date - data.max_daily_capacity}."
            ),
        )

    if data.allocated_for_date > data.max_daily_capacity:
        raise HTTPException(400, "allocated_for_date cannot exceed max_daily_capacity.")
    if "allocated_for_date" in data.model_fields_set:
        _validate_active_load(db, str(cap.worker_id), cap.capacity_date, data.allocated_for_date)
    cap.max_daily_capacity = data.max_daily_capacity
    if "allocated_for_date" in data.model_fields_set:
        cap.allocated_for_date = data.allocated_for_date

    db.flush()

    log_audit(
        db,
        action="CAPACITY_UPDATED",
        entity_type="WORKER_CAPACITY",
        entity_id=str(cap.id),
        summary=f"Updated capacity for record {cap.id} on {cap.capacity_date}: {cap.allocated_for_date}/{cap.max_daily_capacity}."
    )
    return cap


def list_capacities_for_worker(db: Session, worker_id: str) -> list[WorkerDailyCapacity]:
    return list(
        db.query(WorkerDailyCapacity)
        .filter(WorkerDailyCapacity.worker_id == worker_id)
        .order_by(WorkerDailyCapacity.capacity_date.asc())
        .all()
    )
