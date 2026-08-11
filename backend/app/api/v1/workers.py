
from app.database import get_db
from app.schemas.worker import WorkerCreate, WorkerQualificationSummary, WorkerResponse, WorkerUpdate
from app.services.worker_service import create_worker, get_worker, list_workers, update_worker
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(prefix="/workers", tags=["Workers"])


def _to_worker_response(w) -> WorkerResponse:
    return WorkerResponse(
        id=w.id,
        name=w.name,
        email=w.email,
        role=w.role,
        timezone=w.timezone,
        default_max_daily_capacity=w.default_max_daily_capacity,
        availability=w.availability,
        is_active=w.is_active,
        created_at=w.created_at,
        skills=[s.skill_tag for s in w.skills],
        qualifications=[
            WorkerQualificationSummary(
                campaign_id=q.campaign_id,
                status=q.status,
                score=q.score,
                attempts_used=q.attempts_used,
            )
            for q in w.qualifications
        ],
    )


@router.post("", response_model=WorkerResponse, status_code=201)
def api_create_worker(data: WorkerCreate, db: Session = Depends(get_db)):
    worker = create_worker(db, data)
    return _to_worker_response(worker)


@router.get("", response_model=list[WorkerResponse])
def api_list_workers(
    role: str | None = Query(None),
    availability: str | None = Query(None),
    is_active: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    workers = list_workers(db, role=role, availability=availability, is_active=is_active)
    return [_to_worker_response(w) for w in workers]


@router.get("/{worker_id}", response_model=WorkerResponse)
def api_get_worker(worker_id: str, db: Session = Depends(get_db)):
    worker = get_worker(db, worker_id)
    return _to_worker_response(worker)


@router.patch("/{worker_id}", response_model=WorkerResponse)
def api_update_worker(worker_id: str, data: WorkerUpdate, db: Session = Depends(get_db)):
    worker = update_worker(db, worker_id, data)
    return _to_worker_response(worker)
