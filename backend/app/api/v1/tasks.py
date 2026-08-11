from app.database import get_db
from app.schemas.task import TaskBatchCreate, TaskResponse, TaskStateUpdate
from app.services.allocation_service import get_campaign_execution_metrics
from app.services.task_service import create_task_batch, get_task, list_tasks
from app.services.transition_service import transition_task_state
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

router = APIRouter(tags=["Tasks & Execution"])


def _to_task_response(t) -> TaskResponse:
    return TaskResponse(
        id=t.id,
        campaign_id=t.campaign_id,
        external_reference=t.external_reference,
        task_type=t.task_type,
        priority=t.priority,
        state=t.state,
        rework_count=t.rework_count,
        assigned_worker_id=t.assigned_worker_id,
        allocation_id=t.allocation_id,
        operational_date=t.operational_date,
        created_at=t.created_at,
        updated_at=t.updated_at,
        started_at=t.started_at,
        submitted_at=t.submitted_at,
        completed_at=t.completed_at,
        required_skills=[s.skill_tag for s in t.skills],
    )


@router.post("/campaigns/{campaign_id}/tasks", response_model=list[TaskResponse], status_code=201)
def api_create_task_batch(
    campaign_id: str, data: TaskBatchCreate, db: Session = Depends(get_db)
):
    tasks = create_task_batch(db, campaign_id, data)
    return [_to_task_response(t) for t in tasks]


@router.get("/tasks", response_model=list[TaskResponse])
def api_list_tasks(
    campaign_id: str | None = Query(None),
    state: str | None = Query(None),
    worker_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    tasks = list_tasks(db, campaign_id=campaign_id, state=state, worker_id=worker_id, limit=limit, offset=offset)
    return [_to_task_response(t) for t in tasks]


@router.get("/tasks/{task_id}", response_model=TaskResponse)
def api_get_task(task_id: str, db: Session = Depends(get_db)):
    task = get_task(db, task_id)
    return _to_task_response(task)


@router.patch("/tasks/{task_id}/state", response_model=TaskResponse)
def api_update_task_state(
    task_id: str, data: TaskStateUpdate, db: Session = Depends(get_db)
):
    task = get_task(db, task_id)
    updated_task = transition_task_state(db, task, data.state, reason=data.reason)
    return _to_task_response(updated_task)


@router.get("/campaigns/{campaign_id}/execution")
def api_get_campaign_execution(campaign_id: str, db: Session = Depends(get_db)):
    return get_campaign_execution_metrics(db, campaign_id)
