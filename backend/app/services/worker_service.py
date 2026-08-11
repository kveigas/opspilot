
from app.models.allocation import Allocation
from app.models.worker import Worker, WorkerSkill
from app.schemas.worker import WorkerCreate, WorkerUpdate
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def create_worker(db: Session, data: WorkerCreate) -> Worker:
    existing = db.query(Worker).filter(Worker.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Worker with email '{data.email}' already exists."
        )

    worker = Worker(
        name=data.name,
        email=data.email,
        role=data.role,
        timezone=data.timezone,
        default_max_daily_capacity=data.default_max_daily_capacity,
        availability=data.availability,
        is_active=data.is_active,
    )
    db.add(worker)
    db.flush()

    for tag in data.skills:
        db.add(WorkerSkill(worker_id=str(worker.id), skill_tag=tag))

    db.commit()
    db.refresh(worker)

    log_audit(
        db,
        action="WORKER_CREATED",
        entity_type="WORKER",
        entity_id=str(worker.id),
        summary=f"Registered worker '{worker.name}' with role {worker.role}."
    )
    return worker


def get_worker(db: Session, worker_id: str) -> Worker:
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker with id '{worker_id}' not found."
        )
    return worker


def list_workers(
    db: Session,
    role: str | None = None,
    availability: str | None = None,
    is_active: bool | None = None
) -> list[Worker]:
    query = db.query(Worker)
    if role:
        query = query.filter(Worker.role == role)
    if availability:
        query = query.filter(Worker.availability == availability)
    if is_active is not None:
        query = query.filter(Worker.is_active == is_active)
    return list(query.order_by(Worker.name.asc()).all())


def update_worker(db: Session, worker_id: str, data: WorkerUpdate) -> Worker:
    worker = get_worker(db, worker_id)
    update_dict = data.model_dump(exclude_unset=True)

    skills_to_update = update_dict.pop("skills", None)

    new_availability = update_dict.get("availability")
    new_is_active = update_dict.get("is_active")

    # Requirement 17: Surface warning if worker with active allocations becomes unavailable/inactive
    if (new_availability in ["ON_LEAVE", "INACTIVE"]) or (new_is_active is False):
        active_allocations_count = (
            db.query(Allocation)
            .filter(
                Allocation.worker_id == worker_id,
                Allocation.status == "ACTIVE",
            )
            .count()
        )
        if active_allocations_count > 0:
            log_audit(
                db,
                action="WORKER_ALLOCATION_WARNING",
                entity_type="WORKER",
                entity_id=str(worker.id),
                summary=(
                    f"WORKER_HAS_ACTIVE_ALLOCATIONS: Worker '{worker.name}' status changed to "
                    f"availability={new_availability}/is_active={new_is_active} while retaining {active_allocations_count} active task allocations. "
                    "Manager resolution or manual reallocation required."
                ),
            )

    for key, value in update_dict.items():
        setattr(worker, key, value)

    if skills_to_update is not None:
        db.query(WorkerSkill).filter(WorkerSkill.worker_id == str(worker.id)).delete()
        for tag in skills_to_update:
            db.add(WorkerSkill(worker_id=str(worker.id), skill_tag=tag))

    db.commit()
    db.refresh(worker)

    log_audit(
        db,
        action="WORKER_UPDATED",
        entity_type="WORKER",
        entity_id=str(worker.id),
        summary=f"Updated worker '{worker.name}' profile."
    )
    return worker
