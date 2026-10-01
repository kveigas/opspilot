from app.models.escalation import Escalation
from app.models.task import Task
from app.models.worker import Worker, WorkerQualification


def test_demo_bootstrap_first_time_and_repeated(client):
    # 1. First Bootstrap
    res1 = client.post("/api/v1/demo/bootstrap")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] in ["DEMO_INITIALIZED", "EXISTING_DEMO_ACTIVE"]
    assert data1["campaign_id"] == "demo-campaign-ai-eval"
    assert data1["provenance"]["synthetic"] is True

    # 2. Repeated Bootstrap (Idempotent)
    res2 = client.post("/api/v1/demo/bootstrap")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "EXISTING_DEMO_ACTIVE"


def test_demo_advance_workday_and_reset(client, db_session):
    client.post("/api/v1/demo/bootstrap")

    # Advance Workday
    res_adv = client.post("/api/v1/demo/advance-workday")
    assert res_adv.status_code == 200
    adv = res_adv.json()
    assert adv["campaign_id"] == "demo-campaign-ai-eval"

    # Reset Demo
    res_rst = client.post("/api/v1/demo/reset")
    assert res_rst.status_code == 200
    rst = res_rst.json()
    assert rst["status"] == "DEMO_INITIALIZED"
    assert rst["tasks_seeded"] == 2000


def test_demo_recovery_story_end_to_end(client, db_session):
    # 1. Initialize Demo Scenario
    client.post("/api/v1/demo/bootstrap")

    camp_id = "demo-campaign-ai-eval"
    esc_id = "demo-esc-guidelines-01"

    # Verify Initial Unhealthy SLA & Delivery State
    sla_init = client.get(f"/api/v1/campaigns/{camp_id}/sla").json()
    assert sla_init["status"] == "CRITICAL"

    deliv_init = client.get(f"/api/v1/campaigns/{camp_id}/delivery-readiness").json()
    assert deliv_init["status"] == "NOT_READY"

    # Step 1: Manager Resolves Critical Escalation
    client.patch(f"/api/v1/escalations/{esc_id}/status", json={
        "status": "RESOLVED",
        "resolution": "Updated guideline section 4.2 to match client standard",
    })

    # Step 2: Calibrate Worker 11 (Failed -> Passed)
    qual = db_session.query(WorkerQualification).filter(
        WorkerQualification.worker_id == "demo-worker-ann-11"
    ).first()
    if qual:
        qual.status = "PASSED"
        qual.score = 98.0
        db_session.commit()

    # Step 3: Increase Worker 12 Capacity & Unlock Unavailable Worker 10
    w10 = db_session.query(Worker).filter(Worker.id == "demo-worker-ann-10").first()
    if w10:
        w10.availability = "AVAILABLE"
        db_session.commit()

    client.post("/api/v1/workers/capacity", json={
        "worker_id": "demo-worker-ann-12",
        "capacity_date": "2026-08-11",
        "max_daily_capacity": 150,
    })

    # Step 4: Run the real operating loop instead of marking work complete by hand. Completing
    # tasks without QA would (correctly) fail the delivered-accuracy gate for weak annotators.
    start_date = client.get(f"/api/v1/campaigns/{camp_id}").json()["operational_date"]
    alloc = client.post("/api/v1/allocations/trigger", json={"campaign_id": camp_id, "strategy": "QUALITY_AWARE"})
    assert alloc.status_code == 201
    assert alloc.json()["operational_date"] == start_date

    for _ in range(20):
        remaining = db_session.query(Task).filter(Task.campaign_id == camp_id, Task.state != "COMPLETED").count()
        if remaining == 0:
            break
        # Rework that exhausts its attempts opens HIGH escalations; the manager resolves them.
        for e in db_session.query(Escalation).filter(Escalation.campaign_id == camp_id, Escalation.status == "OPEN"):
            e.status = "RESOLVED"
        db_session.commit()
        assert client.post("/api/v1/demo/advance-workday").status_code == 200

    assert db_session.query(Task).filter(Task.campaign_id == camp_id, Task.state != "COMPLETED").count() == 0
    assert client.get(f"/api/v1/campaigns/{camp_id}").json()["operational_date"] > start_date

    # Verify Final Delivery State becomes READY
    deliv_final = client.get(f"/api/v1/campaigns/{camp_id}/delivery-readiness").json()
    assert deliv_final["status"] in ["READY", "READY_WITH_WARNINGS"], deliv_final["blocking_reasons"]
