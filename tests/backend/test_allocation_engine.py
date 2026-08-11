from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerSkill, WorkerQualification
from app.models.task import Task, TaskSkill
from app.models.capacity import WorkerDailyCapacity


def test_allocation_eligibility_and_cross_campaign_capacity(client, db_session):
    # Setup Campaign A (calibration_required = True)
    c_a = Campaign(
        name="Campaign Alpha",
        client_name="Client A",
        task_type="TEXT_ANNOTATION",
        total_volume=100,
        target_daily_throughput=20,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=True,
    )
    db_session.add(c_a)

    # Setup Campaign B (calibration_required = False)
    c_b = Campaign(
        name="Campaign Beta",
        client_name="Client B",
        task_type="TEXT_ANNOTATION",
        total_volume=100,
        target_daily_throughput=20,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False,
    )
    db_session.add(c_b)
    db_session.commit()

    # Create 10 tasks for Campaign A and 10 for Campaign B
    client.post(f"/api/v1/campaigns/{c_a.id}/tasks", json={"count": 10, "required_skill_tags": ["de"]})
    client.post(f"/api/v1/campaigns/{c_b.id}/tasks", json={"count": 10, "required_skill_tags": ["de"]})

    # Worker 1: Qualified on Campaign A, ANNOTATOR role, German skill, capacity 15 on 2026-08-12
    w1 = Worker(name="Worker 1", email="w1@example.com", role="ANNOTATOR", default_max_daily_capacity=15)
    db_session.add(w1)
    db_session.flush()
    db_session.add(WorkerSkill(worker_id=w1.id, skill_tag="de"))
    db_session.add(WorkerQualification(worker_id=w1.id, campaign_id=c_a.id, status="PASSED"))

    # Worker 2: Unqualified on Campaign A, ANNOTATOR role, German skill, capacity 15
    w2 = Worker(name="Worker 2", email="w2@example.com", role="ANNOTATOR", default_max_daily_capacity=15)
    db_session.add(w2)
    db_session.flush()
    db_session.add(WorkerSkill(worker_id=w2.id, skill_tag="de"))

    # Worker 3: Wrong Role (REVIEWER), German skill, capacity 15
    w3 = Worker(name="Worker 3", email="w3@example.com", role="REVIEWER", default_max_daily_capacity=15)
    db_session.add(w3)
    db_session.flush()
    db_session.add(WorkerSkill(worker_id=w3.id, skill_tag="de"))

    db_session.commit()

    # 1. Trigger Allocation for Campaign A (calibration_required = True)
    # Only Worker 1 is qualified -> Worker 1 receives all 10 tasks
    res_a = client.post("/api/v1/allocations/trigger", json={
        "campaign_id": c_a.id,
        "operational_date": "2026-08-12"
    })
    assert res_a.status_code == 201
    data_a = res_a.json()
    assert data_a["tasks_allocated"] == 10
    assert data_a["workers_used"] == 1

    # Check Worker 1 capacity remaining: 15 max - 10 allocated = 5 remaining
    cap_w1 = client.get(f"/api/v1/workers/{w1.id}/capacity?date=2026-08-12").json()
    assert cap_w1["allocated_for_date"] == 10
    assert cap_w1["remaining_capacity_for_date"] == 5

    # 2. Trigger Allocation for Campaign B (calibration_required = False)
    # Both Worker 1 (5 remaining) and Worker 2 (15 remaining) are eligible.
    # Worker 3 is excluded because role == REVIEWER.
    res_b = client.post("/api/v1/allocations/trigger", json={
        "campaign_id": c_b.id,
        "operational_date": "2026-08-12"
    })
    assert res_b.status_code == 201
    data_b = res_b.json()
    assert data_b["tasks_allocated"] == 10
    assert data_b["workers_used"] >= 1

    # Verify cross-campaign capacity limit was NOT violated
    cap_w1_final = client.get(f"/api/v1/workers/{w1.id}/capacity?date=2026-08-12").json()
    assert cap_w1_final["allocated_for_date"] <= 15
