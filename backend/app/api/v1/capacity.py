from datetime import date

from app.database import get_db
from app.schemas.capacity import CapacityCreate, CapacityResponse, CapacityUpdate
from app.services.capacity_service import (
    get_or_create_capacity,
    list_capacities_for_worker,
    update_capacity,
    upsert_capacity,
)
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/workers", tags=["Date-Scoped Capacity"])


@router.get("/{worker_id}/capacity", response_model=CapacityResponse)
def api_get_worker_capacity(
    worker_id: str,
    capacity_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
):
    cap = get_or_create_capacity(db, worker_id=worker_id, capacity_date=capacity_date)
    return CapacityResponse(
        id=cap.id,
        worker_id=cap.worker_id,
        capacity_date=cap.capacity_date,
        max_daily_capacity=cap.max_daily_capacity,
        allocated_for_date=cap.allocated_for_date,
        remaining_capacity_for_date=cap.remaining_capacity_for_date,
    )


@router.post("/capacity", response_model=CapacityResponse, status_code=201)
def api_upsert_worker_capacity(data: CapacityCreate, db: Session = Depends(get_db)):
    cap = upsert_capacity(db, data)
    return CapacityResponse(
        id=cap.id,
        worker_id=cap.worker_id,
        capacity_date=cap.capacity_date,
        max_daily_capacity=cap.max_daily_capacity,
        allocated_for_date=cap.allocated_for_date,
        remaining_capacity_for_date=cap.remaining_capacity_for_date,
    )


@router.patch("/capacity/{capacity_id}", response_model=CapacityResponse)
def api_update_worker_capacity(capacity_id: str, data: CapacityUpdate, db: Session = Depends(get_db)):
    cap = update_capacity(db, capacity_id, data)
    return CapacityResponse(
        id=cap.id,
        worker_id=cap.worker_id,
        capacity_date=cap.capacity_date,
        max_daily_capacity=cap.max_daily_capacity,
        allocated_for_date=cap.allocated_for_date,
        remaining_capacity_for_date=cap.remaining_capacity_for_date,
    )


@router.get("/{worker_id}/capacities", response_model=list[CapacityResponse])
def api_list_worker_capacities(worker_id: str, db: Session = Depends(get_db)):
    caps = list_capacities_for_worker(db, worker_id)
    return [
        CapacityResponse(
            id=c.id,
            worker_id=c.worker_id,
            capacity_date=c.capacity_date,
            max_daily_capacity=c.max_daily_capacity,
            allocated_for_date=c.allocated_for_date,
            remaining_capacity_for_date=c.remaining_capacity_for_date,
        )
        for c in caps
    ]
