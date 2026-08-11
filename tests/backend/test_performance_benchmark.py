import time
from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerSkill


def test_allocation_benchmark_2000_tasks_16_workers(client, db_session):
    # Setup Campaign for 2,000 tasks
    campaign = Campaign(
        name="Synthetic Demo 2K Campaign",
        client_name="Demo Corp",
        task_type="PREFERENCE_RANKING",
        total_volume=2000,
        target_daily_throughput=300,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 25),
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    # Create 2,000 tasks
    client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 2000, "required_skill_tags": ["nlp"]})

    # Create 16 workers
    for i in range(1, 17):
        w = Worker(
            name=f"Worker {i:02d}",
            email=f"worker{i}@democorp.com",
            role="ANNOTATOR",
            default_max_daily_capacity=150,
            availability="AVAILABLE",
            is_active=True,
        )
        db_session.add(w)
        db_session.flush()
        db_session.add(WorkerSkill(worker_id=w.id, skill_tag="nlp"))

    db_session.commit()

    # Benchmark allocation execution time
    start_time = time.time()
    res = client.post("/api/v1/allocations/trigger", json={
        "campaign_id": campaign.id,
        "operational_date": "2026-08-12"
    })
    elapsed = time.time() - start_time

    assert res.status_code == 201
    data = res.json()
    assert data["tasks_considered"] == 2000
    assert data["tasks_allocated"] == 2000
    assert data["workers_used"] == 16

    print(f"\n[BENCHMARK] Allocated 2,000 tasks across 16 workers in {elapsed:.3f} seconds.")
    assert elapsed < 5.0  # Must complete well within local development threshold
