from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerSkill
from app.models.task import Task


def test_sla_engine_boundaries_overrides_and_multi_reason(client, db_session):
    campaign = Campaign(
        name="SLA Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=100,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    # Create 100 tasks
    client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 100, "required_skill_tags": ["en"]})

    # Add 1 ANNOTATOR worker with capacity 20
    worker = Worker(name="SLA Worker", email="sla@example.com", role="ANNOTATOR", default_max_daily_capacity=20)
    db_session.add(worker)
    db_session.flush()
    db_session.add(WorkerSkill(worker_id=worker.id, skill_tag="en"))
    db_session.commit()

    # Initial SLA check
    sla1 = client.get(f"/api/v1/campaigns/{campaign.id}/sla?date=2026-08-11").json()
    assert sla1["campaign_id"] == campaign.id
    assert sla1["status"] in ["ON_TRACK", "AT_RISK", "CRITICAL"]

    # 1. HIGH severity escalation does NOT activate CRITICAL_ESCALATION_OPEN
    client.post("/api/v1/escalations", json={
        "campaign_id": campaign.id,
        "title": "High severity quality issue",
        "description": "Max rework attempts exceeded",
        "severity": "HIGH",
        "category": "QUALITY"
    })

    sla_high = client.get(f"/api/v1/campaigns/{campaign.id}/sla?date=2026-08-11").json()
    assert "CRITICAL_ESCALATION_OPEN" not in sla_high["reason_codes"]

    # 2. CRITICAL severity escalation DOES activate CRITICAL_ESCALATION_OPEN
    client.post("/api/v1/escalations", json={
        "campaign_id": campaign.id,
        "title": "Critical blocker",
        "description": "Blocker description",
        "severity": "CRITICAL",
        "category": "SLA"
    })

    sla2 = client.get(f"/api/v1/campaigns/{campaign.id}/sla?date=2026-08-11").json()
    assert sla2["status"] == "CRITICAL"
    assert "CRITICAL_ESCALATION_OPEN" in sla2["reason_codes"]

    # 3. Block > 5 tasks -> adds BLOCKER_VOLUME_HIGH reason
    tasks = db_session.query(Task).filter(Task.campaign_id == campaign.id).limit(6).all()
    for t in tasks:
        t.state = "BLOCKED"
    db_session.commit()

    sla3 = client.get(f"/api/v1/campaigns/{campaign.id}/sla?date=2026-08-11").json()
    assert sla3["status"] == "CRITICAL"
    assert "BLOCKER_VOLUME_HIGH" in sla3["reason_codes"]
    assert "CRITICAL_ESCALATION_OPEN" in sla3["reason_codes"]  # Multi-reason aggregation verified!


def test_sla_overdue_and_zero_capacity_overrides(client, db_session):
    campaign = Campaign(
        name="Overdue SLA Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 1),
        due_date=date(2026, 8, 5),  # Overdue relative to 2026-08-10
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 10, "required_skill_tags": ["nlp"]})

    # Query SLA for date past due_date
    sla = client.get(f"/api/v1/campaigns/{campaign.id}/sla?date=2026-08-10").json()
    assert sla["status"] == "CRITICAL"
    assert "CAMPAIGN_OVERDUE" in sla["reason_codes"]
    assert "ZERO_ELIGIBLE_CAPACITY" in sla["reason_codes"]
