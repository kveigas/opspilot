import json
from datetime import UTC, date, datetime, timedelta

from app.models.allocation import Allocation, AllocationRun
from app.models.campaign import Campaign
from app.models.capacity import WorkerDailyCapacity
from app.models.task import Task
from app.models.worker import Worker
from app.services.audit_service import log_audit
from app.services.qualification_helper import is_worker_qualified_for_campaign
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

PRIORITY_RANK = {"URGENT": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 4}


def trigger_allocation_run(
    db: Session,
    campaign_id: str,
    operational_date: date,
    max_tasks_to_allocate: int | None = None,
) -> AllocationRun:
    db.expire_all()

    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    # 1. Gather unassigned allocatable tasks for this campaign
    unassigned_tasks_query = (
        db.query(Task)
        .filter(
            Task.campaign_id == campaign_id,
            Task.state == "UNASSIGNED",
        )
        .order_by(Task.created_at.asc())
    )

    if max_tasks_to_allocate:
        unassigned_tasks = list(unassigned_tasks_query.limit(max_tasks_to_allocate).all())
    else:
        unassigned_tasks = list(unassigned_tasks_query.all())

    tasks_considered = len(unassigned_tasks)

    # 2. Gather candidate workers and evaluation metrics
    all_workers = list(db.query(Worker).order_by(Worker.name.asc()).all())

    # Pre-fetch or initialize capacities for operational_date
    capacities_map: dict[str, WorkerDailyCapacity] = {}
    for w in all_workers:
        cap = (
            db.query(WorkerDailyCapacity)
            .filter(
                WorkerDailyCapacity.worker_id == w.id,
                WorkerDailyCapacity.capacity_date == operational_date,
            )
            .first()
        )
        if not cap:
            cap = WorkerDailyCapacity(
                worker_id=str(w.id),
                capacity_date=operational_date,
                max_daily_capacity=int(w.default_max_daily_capacity),
                allocated_for_date=0,
            )
            db.add(cap)
            db.flush()
        capacities_map[str(w.id)] = cap

    # Filter eligible workers for this campaign & date
    unallocated_reason_counts = {
        "NO_ELIGIBLE_WORKER": 0,
        "NO_CAPACITY": 0,
        "MISSING_REQUIRED_SKILL": 0,
        "QUALIFICATION_REQUIRED": 0,
        "NO_ACTIVE_ANNOTATOR": 0,
    }

    # Task required skills
    campaign_skills = {s.skill_tag.lower().strip() for s in campaign.skills}

    eligible_workers: list[Worker] = []
    for w in all_workers:
        # Check active & availability
        if not w.is_active or w.availability != "AVAILABLE":
            continue

        # Role rule: ANNOTATOR role required for production annotation tasks
        if str(w.role) != "ANNOTATOR":
            continue

        # Skill matching: worker must contain ALL campaign/task skill tags
        w_skills = {s.skill_tag.lower().strip() for s in w.skills}
        if not campaign_skills.issubset(w_skills):
            continue

        # Conditional Qualification
        if not is_worker_qualified_for_campaign(db, w, campaign):
            continue

        # Remaining capacity check
        cap = capacities_map[str(w.id)]
        if cap.remaining_capacity_for_date <= 0:
            continue

        eligible_workers.append(w)

    # Sort eligible workers deterministically:
    # 1. remaining capacity ratio descending
    # 2. allocated_for_date ascending
    # 3. worker_id UUID ascending
    def _worker_sort_key(w: Worker):
        cap = capacities_map[str(w.id)]
        ratio = cap.remaining_capacity_for_date / float(cap.max_daily_capacity) if cap.max_daily_capacity > 0 else 0
        return (-ratio, cap.allocated_for_date, str(w.id))

    eligible_workers.sort(key=_worker_sort_key)

    # Allocation run container
    run = AllocationRun(
        campaign_id=campaign_id,
        operational_date=operational_date,
        tasks_considered=tasks_considered,
        tasks_allocated=0,
        tasks_unallocated=0,
        workers_used=0,
        capacity_consumed=0,
    )
    db.add(run)
    db.flush()

    if not eligible_workers or tasks_considered == 0:
        # Categorize unallocated reasons
        if tasks_considered > 0:
            active_annotators = [w for w in all_workers if w.is_active and w.availability == "AVAILABLE" and str(w.role) == "ANNOTATOR"]
            if not active_annotators:
                unallocated_reason_counts["NO_ACTIVE_ANNOTATOR"] = tasks_considered
            else:
                for w in active_annotators:
                    w_skills = {s.skill_tag.lower().strip() for s in w.skills}
                    if not campaign_skills.issubset(w_skills):
                        unallocated_reason_counts["MISSING_REQUIRED_SKILL"] += tasks_considered
                    elif not is_worker_qualified_for_campaign(db, w, campaign):
                        unallocated_reason_counts["QUALIFICATION_REQUIRED"] += tasks_considered
                    elif capacities_map[str(w.id)].remaining_capacity_for_date <= 0:
                        unallocated_reason_counts["NO_CAPACITY"] += tasks_considered
                    else:
                        unallocated_reason_counts["NO_ELIGIBLE_WORKER"] += tasks_considered

        run.tasks_unallocated = tasks_considered
        run.unallocated_reasons_json = json.dumps(unallocated_reason_counts)
        db.commit()
        db.refresh(run)
        return run

    # Round-Robin Balanced Allocation Loop
    tasks_allocated_count = 0
    workers_used_set = set()
    worker_index = 0
    now = datetime.now(UTC)
    allocations_to_add: list[Allocation] = []

    for task in unassigned_tasks:
        # Find next eligible worker with remaining capacity
        allocated_task = False
        attempts = 0

        while attempts < len(eligible_workers):
            candidate_worker = eligible_workers[worker_index % len(eligible_workers)]
            worker_index += 1
            attempts += 1

            cap = capacities_map[str(candidate_worker.id)]
            if cap.remaining_capacity_for_date > 0:
                # Build allocation object
                alloc = Allocation(
                    allocation_run_id=str(run.id),
                    campaign_id=campaign_id,
                    task_id=str(task.id),
                    worker_id=str(candidate_worker.id),
                    operational_date=operational_date,
                    allocated_at=now,
                    status="ACTIVE",
                )
                allocations_to_add.append(alloc)

                # Update task state
                task.state = "ASSIGNED"
                task.assigned_worker_id = str(candidate_worker.id)
                task.allocation_id = str(alloc.id)
                task.operational_date = operational_date
                task.updated_at = now

                # Increment allocated_for_date on worker daily capacity
                cap.allocated_for_date = cap.allocated_for_date + 1

                tasks_allocated_count += 1
                workers_used_set.add(str(candidate_worker.id))
                allocated_task = True
                break

        if not allocated_task:
            unallocated_reason_counts["NO_CAPACITY"] += 1

    db.add_all(allocations_to_add)

    run.tasks_allocated = tasks_allocated_count
    run.tasks_unallocated = tasks_considered - tasks_allocated_count
    run.workers_used = len(workers_used_set)
    run.capacity_consumed = tasks_allocated_count
    run.unallocated_reasons_json = json.dumps(unallocated_reason_counts)

    db.commit()
    db.refresh(run)

    log_audit(
        db,
        action="ALLOCATION_RUN_COMPLETED",
        entity_type="ALLOCATION_RUN",
        entity_id=str(run.id),
        summary=(
            f"Allocation run completed for campaign '{campaign.name}' on {operational_date}: "
            f"{tasks_allocated_count}/{tasks_considered} tasks allocated across {len(workers_used_set)} workers."
        ),
    )

    return run


def release_allocation(db: Session, allocation_id: str, reason: str | None = "MANUAL_RELEASE") -> Allocation:
    alloc = db.query(Allocation).filter(Allocation.id == allocation_id).first()
    if not alloc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Allocation with id '{allocation_id}' not found."
        )

    if str(alloc.status) != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Allocation '{allocation_id}' is already {alloc.status}."
        )

    now = datetime.now(UTC)
    alloc.status = "RELEASED"
    alloc.deallocated_at = now
    alloc.reason = reason

    # Restore worker capacity
    cap = (
        db.query(WorkerDailyCapacity)
        .filter(
            WorkerDailyCapacity.worker_id == str(alloc.worker_id),
            WorkerDailyCapacity.capacity_date == alloc.operational_date,
        )
        .first()
    )

    if cap and cap.allocated_for_date > 0:
        cap.allocated_for_date = cap.allocated_for_date - 1

    # Return task to UNASSIGNED
    task = db.query(Task).filter(Task.id == str(alloc.task_id)).first()
    if task:
        task.state = "UNASSIGNED"
        task.assigned_worker_id = None
        task.allocation_id = None
        task.updated_at = now

    db.commit()
    db.refresh(alloc)

    log_audit(
        db,
        action="TASK_DEALLOCATED",
        entity_type="ALLOCATION",
        entity_id=str(alloc.id),
        summary=f"Released allocation '{alloc.id}' for task '{alloc.task_id}'. Capacity restored to worker.",
    )

    return alloc


def get_campaign_execution_metrics(db: Session, campaign_id: str) -> dict:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign with id '{campaign_id}' not found."
        )

    tasks = list(db.query(Task).filter(Task.campaign_id == campaign_id).all())
    total_tasks = len(tasks)

    state_counts = {
        "UNASSIGNED": 0,
        "ASSIGNED": 0,
        "IN_PROGRESS": 0,
        "SUBMITTED": 0,
        "IN_REVIEW": 0,
        "ACCEPTED": 0,
        "REWORK_REQUIRED": 0,
        "BLOCKED": 0,
        "ESCALATED": 0,
        "COMPLETED": 0,
    }

    for t in tasks:
        s = str(t.state)
        if s in state_counts:
            state_counts[s] += 1

    completed_count = state_counts["COMPLETED"]
    completion_pct = round((completed_count / total_tasks * 100.0), 1) if total_tasks > 0 else 0.0
    remaining_backlog = total_tasks - completed_count

    # Derived Throughput based on completed_at
    now = datetime.now(UTC)
    today_start = datetime(now.year, now.month, now.day, tzinfo=UTC)
    seven_days_ago = now - timedelta(days=7)

    completed_today = 0
    completed_last_7_days = 0

    for t in tasks:
        if t.state == "COMPLETED" and t.completed_at:
            comp_dt = t.completed_at
            if comp_dt.tzinfo is None:
                comp_dt = comp_dt.replace(tzinfo=UTC)
            if comp_dt >= today_start:
                completed_today += 1
            if comp_dt >= seven_days_ago:
                completed_last_7_days += 1

    avg_daily_7d = round(completed_last_7_days / 7.0, 1)

    return {
        "campaign_id": campaign_id,
        "total_tasks": total_tasks,
        "completion_pct": completion_pct,
        "remaining_backlog": remaining_backlog,
        "state_counts": state_counts,
        "throughput": {
            "completed_today": completed_today,
            "completed_last_7_days": completed_last_7_days,
            "average_daily_completed_last_7_days": avg_daily_7d,
        },
    }
