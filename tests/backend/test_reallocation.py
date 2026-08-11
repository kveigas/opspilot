from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerSkill


def test_allocation_release_reallocation_and_conflict(client, db_session):
    campaign = Campaign(
        name="Reallocation Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 5, "required_skill_tags": ["en"]})

    worker = Worker(name="Realloc Worker", email="realloc@example.com", role="ANNOTATOR", default_max_daily_capacity=10)
    db_session.add(worker)
    db_session.flush()
    db_session.add(WorkerSkill(worker_id=worker.id, skill_tag="en"))
    db_session.commit()

    # Trigger allocation -> 5 tasks allocated to worker
    alloc_run = client.post("/api/v1/allocations/trigger", json={
        "campaign_id": campaign.id,
        "operational_date": "2026-08-12"
    }).json()
    assert alloc_run["tasks_allocated"] == 5

    # Fetch allocation list
    allocs = client.get(f"/api/v1/allocations?campaign_id={campaign.id}").json()
    assert len(allocs) == 5
    target_alloc = allocs[0]

    # 1. Release allocation
    rel_res = client.post(f"/api/v1/allocations/{target_alloc['id']}/release?reason=WORKER_LEAVE")
    assert rel_res.status_code == 200
    assert rel_res.json()["status"] == "RELEASED"

    # Verify task state returned to UNASSIGNED
    task_res = client.get(f"/api/v1/tasks/{target_alloc['task_id']}").json()
    assert task_res["state"] == "UNASSIGNED"
    assert task_res["assigned_worker_id"] is None

    # Verify worker allocated load reduced by 1 (5 -> 4)
    cap = client.get(f"/api/v1/workers/{worker.id}/capacity?date=2026-08-12").json()
    assert cap["allocated_for_date"] == 4

    # 2. Test Capacity Reduction Conflict (409 Conflict)
    # Attempting to reduce max_daily_capacity to 2 when allocated_for_date == 4
    cap_id = cap["id"]
    conflict_res = client.patch(f"/api/v1/workers/capacity/{cap_id}", json={
        "max_daily_capacity": 2,
        "allocated_for_date": 4
    })
    assert conflict_res.status_code == 409
    assert "WORKER_ALLOCATION_CONFLICT" in conflict_res.json()["detail"]

    # 3. Test Worker Availability Change Audit Warning (WORKER_ALLOCATION_WARNING)
    # Change worker availability to ON_LEAVE while worker retains 4 active allocations
    update_res = client.patch(f"/api/v1/workers/{worker.id}", json={"availability": "ON_LEAVE"})
    assert update_res.status_code == 200

    audit_logs = client.get("/api/v1/audit-logs").json()
    warning_actions = [l["action"] for l in audit_logs]
    assert "WORKER_ALLOCATION_WARNING" in warning_actions
