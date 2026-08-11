from datetime import date
from app.models.campaign import Campaign


def test_task_batch_creation_and_volume_contract(client, db_session):
    campaign = Campaign(
        name="Task Contract Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
    )
    db_session.add(campaign)
    db_session.commit()

    # Create 30 tasks
    res1 = client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 30, "required_skill_tags": ["de"]})
    assert res1.status_code == 201
    tasks1 = res1.json()
    assert len(tasks1) == 30
    assert tasks1[0]["state"] == "UNASSIGNED"
    assert "de" in tasks1[0]["required_skills"]

    # Try creating 30 more tasks (30 + 30 = 60 > total_volume 50 -> Reject 400 Bad Request)
    res2 = client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 30})
    assert res2.status_code == 400
    assert "Campaign volume limit is 50" in res2.json()["detail"]

    # Create remaining 20 tasks
    res3 = client.post(f"/api/v1/campaigns/{campaign.id}/tasks", json={"count": 20})
    assert res3.status_code == 201
    assert len(res3.json()) == 20
