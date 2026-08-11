from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker
from app.models.task import Task
from app.models.escalation import Escalation


def test_rework_attempts_and_max_threshold_escalation_invariants(client, db_session):
    campaign = Campaign(
        name="Rework Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False,
    )
    db_session.add(campaign)
    annotator = Worker(name="Rework Annotator", email="rw_ann@example.com", role="ANNOTATOR")
    reviewer = Worker(name="Rework Reviewer", email="rw_rev@example.com", role="REVIEWER")
    db_session.add_all([annotator, reviewer])
    db_session.commit()

    task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="IN_REVIEW", assigned_worker_id=annotator.id)
    db_session.add(task)
    db_session.commit()

    # 1. First Rework -> rework_count = 1, state = ASSIGNED, NO Escalation record
    client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "REWORK",
        "reason_code": "LABEL_ERROR",
        "comment": "Fix label formatting"
    })
    t1 = client.get(f"/api/v1/tasks/{task.id}").json()
    assert t1["state"] == "ASSIGNED"
    assert db_session.query(Escalation).filter(Escalation.task_id == task.id).count() == 0

    # Annotator resubmits task
    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "IN_PROGRESS"})
    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "SUBMITTED"})
    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "IN_REVIEW"})

    # 2. Second Rework -> rework_count = 2, state = ASSIGNED, NO Escalation record
    client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "REWORK",
        "reason_code": "LABEL_ERROR"
    })
    assert db_session.query(Escalation).filter(Escalation.task_id == task.id).count() == 0

    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "IN_PROGRESS"})
    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "SUBMITTED"})
    client.patch(f"/api/v1/tasks/{task.id}/state", json={"state": "IN_REVIEW"})

    # 3. Third Rework -> Max rework threshold (3) exceeded -> Task auto-escalated & EXACTLY ONE Escalation record created
    client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "REWORK",
        "reason_code": "INCOMPLETE_WORK"
    })

    t3 = client.get(f"/api/v1/tasks/{task.id}").json()
    assert t3["state"] == "ESCALATED"

    # Invariants Check
    escalations = db_session.query(Escalation).filter(Escalation.task_id == task.id).all()
    assert len(escalations) == 1
    esc = escalations[0]
    assert esc.campaign_id == campaign.id
    assert esc.task_id == task.id
    assert esc.severity == "HIGH"
    assert esc.category == "QUALITY"
    assert esc.status == "OPEN"
    assert esc.blocker is True
    assert "MAX_REWORK_ATTEMPTS_EXCEEDED" in esc.title

    # Review history intact (3 review records exist)
    reviews = client.get(f"/api/v1/reviews?task_id={task.id}").json()
    assert len(reviews) == 3

    # Duplicate action protection (submitting another review while escalated does NOT create duplicate escalation)
    client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "REWORK",
        "reason_code": "INCOMPLETE_WORK"
    })
    escalations_after = db_session.query(Escalation).filter(Escalation.task_id == task.id).all()
    assert len(escalations_after) == 1

    # Appears in GET escalations API
    api_escalations = client.get(f"/api/v1/escalations?campaign_id={campaign.id}").json()
    assert len(api_escalations) == 1
    assert api_escalations[0]["id"] == esc.id

    # Appears in Today cockpit rework_items
    today = client.get("/api/v1/today").json()
    rework_ids = [r["task_id"] for r in today["rework_items"]]
    assert task.id in rework_ids
