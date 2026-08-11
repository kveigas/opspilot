
from app.models.campaign import Campaign
from app.models.task import Task, TaskSkill
from app.schemas.task import TaskBatchCreate
from app.services.audit_service import log_audit
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


def create_task_batch(db: Session, campaign_id: str, data: TaskBatchCreate) -> list[Task]:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    # Check total volume bound contract
    existing_count = db.query(Task).filter(Task.campaign_id == campaign_id).count()
    if existing_count + data.count > int(campaign.total_volume):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot create {data.count} tasks. Campaign volume limit is {campaign.total_volume} "
                f"and {existing_count} tasks already exist."
            ),
        )

    effective_priority = data.priority or str(campaign.priority)
    prefix = data.external_reference_prefix or "TASK"
    skills_to_apply = data.required_skill_tags if data.required_skill_tags else [s.skill_tag for s in campaign.skills]

    created_tasks: list[Task] = []

    for i in range(1, data.count + 1):
        task = Task(
            campaign_id=campaign_id,
            external_reference=f"{prefix}-{existing_count + i:04d}",
            task_type=str(campaign.task_type),
            priority=effective_priority,
            state="UNASSIGNED",
        )
        for tag in skills_to_apply:
            task.skills.append(TaskSkill(skill_tag=tag.lower().strip()))
        created_tasks.append(task)

    db.add_all(created_tasks)
    db.commit()

    for t in created_tasks:
        db.refresh(t)

    log_audit(
        db,
        action="TASK_BATCH_CREATED",
        entity_type="CAMPAIGN",
        entity_id=campaign_id,
        summary=f"Created batch of {data.count} tasks for campaign '{campaign.name}'.",
    )

    return created_tasks


def get_task(db: Session, task_id: str) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id '{task_id}' not found.",
        )
    return task


def list_tasks(
    db: Session,
    campaign_id: str | None = None,
    state: str | None = None,
    worker_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Task]:
    query = db.query(Task)
    if campaign_id:
        query = query.filter(Task.campaign_id == campaign_id)
    if state:
        query = query.filter(Task.state == state)
    if worker_id:
        query = query.filter(Task.assigned_worker_id == worker_id)

    return list(query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all())
