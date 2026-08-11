from datetime import date
from app.models.campaign import Campaign
from app.models.task import Task


def test_escalation_lifecycle_and_invalid_transitions(client, db_session):
    campaign = Campaign(
        name="Escalation Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
    )
    db_session.add(campaign)
    db_session.commit()

    task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="IN_PROGRESS")
    db_session.add(task)
    db_session.commit()

    # 1. Create Escalation
    esc_res = client.post("/api/v1/escalations", json={
        "campaign_id": campaign.id,
        "task_id": task.id,
        "title": "Unclear guideline on edge case",
        "description": "Guideline section 4 contradicts section 2",
        "severity": "CRITICAL",
        "category": "GUIDELINE",
        "blocker": True,
    })
    assert esc_res.status_code == 201
    esc_data = esc_res.json()
    esc_id = esc_data["id"]
    assert esc_data["status"] == "OPEN"

    # Task state transitioned to ESCALATED
    t_data = client.get(f"/api/v1/tasks/{task.id}").json()
    assert t_data["state"] == "ESCALATED"

    # 2. Invalid Escalation Transition CLOSED -> OPEN (should return 409 Conflict)
    # First transition OPEN -> RESOLVED -> CLOSED
    client.patch(f"/api/v1/escalations/{esc_id}/status", json={"status": "RESOLVED", "resolution": "Guideline updated"})
    client.patch(f"/api/v1/escalations/{esc_id}/status", json={"status": "CLOSED"})

    bad_res = client.patch(f"/api/v1/escalations/{esc_id}/status", json={"status": "OPEN"})
    assert bad_res.status_code == 409

    # 3. Post-resolution task state transition
    task2 = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="ESCALATED")
    db_session.add(task2)
    db_session.commit()

    esc2 = client.post("/api/v1/escalations", json={
        "campaign_id": campaign.id,
        "task_id": task2.id,
        "title": "Tooling outage",
        "description": "API unavailable",
        "severity": "HIGH",
        "category": "TOOLING"
    }).json()

    client.patch(f"/api/v1/escalations/{esc2['id']}/status", json={
        "status": "RESOLVED",
        "resolution": "API service restored",
        "target_task_state": "IN_PROGRESS"
    })

    t2_data = client.get(f"/api/v1/tasks/{task2.id}").json()
    assert t2_data["state"] == "IN_PROGRESS"
