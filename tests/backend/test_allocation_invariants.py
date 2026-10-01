import json
from datetime import date

from app.models.allocation import Allocation
from app.models.campaign import Campaign
from app.models.task import Task, TaskSkill
from app.models.worker import Worker, WorkerSkill
from app.services.allocation_service import trigger_allocation_run


def setup_work(db):
    campaign = Campaign(name="Constrained campaign", client_name="Synthetic", task_type="TEXT_ANNOTATION",
                        total_volume=3, target_daily_throughput=1, start_date=date(2026, 8, 1),
                        due_date=date(2026, 8, 30), calibration_required=False)
    worker = Worker(name="Qualified", email="invariant@example.com", role="ANNOTATOR", default_max_daily_capacity=1)
    db.add_all([campaign, worker])
    db.flush()
    db.add(WorkerSkill(worker_id=worker.id, skill_tag="en"))
    tasks = [Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", priority=priority)
             for priority in ("LOW", "URGENT", "HIGH")]
    db.add_all(tasks)
    db.flush()
    for task, skill in zip(tasks, ("en", "en", "de")):
        db.add(TaskSkill(task_id=task.id, skill_tag=skill))
    db.commit()
    return campaign, worker, tasks


def test_priority_task_skills_and_allocation_link_are_enforced(db_session):
    campaign, worker, tasks = setup_work(db_session)
    result = trigger_allocation_run(db_session, campaign.id, date(2026, 8, 12))
    assert result.tasks_allocated == 1
    assert tasks[1].state == "ASSIGNED"  # urgent before older low-priority work
    allocation = db_session.get(Allocation, tasks[1].allocation_id)
    assert allocation is not None and allocation.task_id == tasks[1].id
    assert allocation.worker_id == worker.id
    assert tasks[2].state == "UNASSIGNED"  # no German-qualified worker
    reasons = json.loads(result.unallocated_reasons_json)
    assert reasons["MISSING_REQUIRED_SKILL"] == 1
    assert reasons["NO_CAPACITY"] == 1
    assert sum(reasons.values()) == result.tasks_unallocated


def test_cannot_erase_reserved_capacity_or_reopen_completed_work(client, db_session):
    campaign, worker, tasks = setup_work(db_session)
    trigger_allocation_run(db_session, campaign.id, date(2026, 8, 12))
    cap = client.get(f"/api/v1/workers/{worker.id}/capacity?date=2026-08-12").json()
    unchanged = client.patch(f"/api/v1/workers/capacity/{cap['id']}", json={"max_daily_capacity": 2})
    assert unchanged.status_code == 200
    assert unchanged.json()["allocated_for_date"] == 1
    rejected = client.patch(f"/api/v1/workers/capacity/{cap['id']}", json={"max_daily_capacity": 2, "allocated_for_date": 0})
    assert rejected.status_code == 409
    task = tasks[1]
    allocation_id = task.allocation_id
    task.state = "COMPLETED"
    db_session.commit()
    assert client.post(f"/api/v1/allocations/{allocation_id}/release").status_code == 409
    db_session.expire_all()
    assert db_session.get(Task, task.id).state == "COMPLETED"
    assert db_session.get(Allocation, allocation_id).status == "ACTIVE"


def test_unallocated_reason_counts_do_not_multiply_by_workers(db_session):
    campaign, _, _ = setup_work(db_session)
    for index in range(3):
        db_session.add(Worker(name=f"Unavailable {index}", email=f"missing{index}@example.com", role="ANNOTATOR", default_max_daily_capacity=1))
    db_session.commit()
    trigger_allocation_run(db_session, campaign.id, date(2026, 8, 12))
    run = trigger_allocation_run(db_session, campaign.id, date(2026, 8, 12))
    assert sum(json.loads(run.unallocated_reasons_json).values()) == run.tasks_unallocated
