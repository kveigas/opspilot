from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker
from app.models.task import Task


def test_review_submission_and_eligibility_rules(client, db_session):
    campaign = Campaign(
        name="Review Campaign",
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

    # Annotator Worker
    annotator = Worker(name="Annotator 1", email="ann1@example.com", role="ANNOTATOR")
    # Reviewer Worker
    reviewer = Worker(name="Reviewer 1", email="rev1@example.com", role="REVIEWER")
    db_session.add_all([annotator, reviewer])
    db_session.commit()

    task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="IN_REVIEW", assigned_worker_id=annotator.id)
    db_session.add(task)
    db_session.commit()

    # 1. Annotator cannot review by default (Role must be REVIEWER)
    res_bad_role = client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": annotator.id,
        "verdict": "ACCEPT"
    })
    assert res_bad_role.status_code == 400
    assert "Worker must have role 'REVIEWER'" in res_bad_role.json()["detail"]

    # 2. Self-Review Prohibited (Annotator trying to review own task)
    reviewer_same = Worker(name="Self Reviewer", email="self@example.com", role="REVIEWER")
    db_session.add(reviewer_same)
    db_session.commit()
    task.assigned_worker_id = reviewer_same.id
    db_session.commit()

    res_self = client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer_same.id,
        "verdict": "ACCEPT"
    })
    assert res_self.status_code == 400
    assert "SELF_REVIEW_PROHIBITED" in res_self.json()["detail"]

    # 3. REWORK requires reason code
    task.assigned_worker_id = annotator.id
    db_session.commit()

    res_no_reason = client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "REWORK"  # missing reason_code
    })
    assert res_no_reason.status_code == 400
    assert "Reason code is required" in res_no_reason.json()["detail"]

    # 4. Valid ACCEPT verdict -> Task COMPLETED
    res_accept = client.post("/api/v1/reviews", json={
        "task_id": task.id,
        "reviewer_id": reviewer.id,
        "verdict": "ACCEPT"
    })
    assert res_accept.status_code == 201
    assert res_accept.json()["verdict"] == "ACCEPT"

    task_updated = client.get(f"/api/v1/tasks/{task.id}").json()
    assert task_updated["state"] == "COMPLETED"


def test_review_sampling_and_list_reviews(client, db_session):
    campaign = Campaign(
        name="Sampling Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=50,
        target_daily_throughput=10,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        review_sampling_pct=50.0,
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    # Create 4 submitted tasks
    t1 = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
    t2 = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
    t3 = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
    t4 = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
    db_session.add_all([t1, t2, t3, t4])
    db_session.commit()

    sample_res = client.post(f"/api/v1/campaigns/{campaign.id}/reviews/sample")
    assert sample_res.status_code == 200
    sample_data = sample_res.json()
    assert sample_data["total_submitted"] == 4
    assert sample_data["tasks_sent_to_review"] == 2
    assert sample_data["tasks_auto_completed"] == 2

    # Query reviews endpoint
    reviews = client.get(f"/api/v1/reviews?campaign_id={campaign.id}").json()
    assert isinstance(reviews, list)
