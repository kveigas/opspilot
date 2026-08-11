from datetime import date
from app.models.campaign import Campaign
from app.models.task import Task


def test_valid_and_invalid_state_transitions(client, db_session):
    campaign = Campaign(
        name="State Machine Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
    )
    db_session.add(campaign)
    db_session.commit()

    task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="UNASSIGNED")
    db_session.add(task)
    db_session.commit()
    t_id = task.id

    # 1. Invalid Transition UNASSIGNED -> COMPLETED (should return 409 Conflict)
    bad_res1 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "COMPLETED"})
    assert bad_res1.status_code == 409

    # 2. Valid Transition UNASSIGNED -> ASSIGNED
    res1 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "ASSIGNED"})
    assert res1.status_code == 200
    assert res1.json()["state"] == "ASSIGNED"

    # 3. Invalid Transition ASSIGNED -> ACCEPTED (should return 409 Conflict)
    bad_res2 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "ACCEPTED"})
    assert bad_res2.status_code == 409

    # 4. Valid ASSIGNED -> IN_PROGRESS (sets started_at timestamp)
    res2 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "IN_PROGRESS"})
    assert res2.status_code == 200
    assert res2.json()["started_at"] is not None

    # 5. Valid IN_PROGRESS -> SUBMITTED (sets submitted_at timestamp)
    res3 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "SUBMITTED"})
    assert res3.status_code == 200
    assert res3.json()["submitted_at"] is not None

    # 6. Valid SUBMITTED -> IN_REVIEW -> ACCEPTED -> COMPLETED
    client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "IN_REVIEW"})
    client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "ACCEPTED"})
    res_final = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "COMPLETED"})
    assert res_final.status_code == 200
    assert res_final.json()["state"] == "COMPLETED"
    assert res_final.json()["completed_at"] is not None

    # 7. Invalid COMPLETED -> IN_PROGRESS (should return 409 Conflict)
    bad_res3 = client.patch(f"/api/v1/tasks/{t_id}/state", json={"state": "IN_PROGRESS"})
    assert bad_res3.status_code == 409
