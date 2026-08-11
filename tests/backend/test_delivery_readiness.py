from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker
from app.models.task import Task
from app.models.review import Review


def test_delivery_readiness_gates(client, db_session):
    campaign = Campaign(
        name="Delivery Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=5,
        target_daily_throughput=5,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        review_sampling_pct=0.0,  # 0% sampling target -> quality gate N/A
    )
    db_session.add(campaign)
    db_session.commit()

    # 1. Initial State -> Volume Incomplete -> NOT_READY
    deliv1 = client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()
    assert deliv1["status"] == "NOT_READY"
    assert len(deliv1["blocking_reasons"]) > 0

    # 2. Complete all 5 tasks
    tasks = []
    for i in range(1, 6):
        t = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED", external_reference=f"T-{i}")
        tasks.append(t)
    db_session.add_all(tasks)
    db_session.commit()

    # 3. All gates pass -> READY
    deliv2 = client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()
    assert deliv2["status"] == "READY"
    assert len(deliv2["blocking_reasons"]) == 0
    assert len(deliv2["gates"]) == 5


def test_unsampled_tasks_and_insufficient_qa_evidence_semantics(client, db_session):
    campaign = Campaign(
        name="QA Evidence Campaign",
        client_name="QA Client",
        task_type="TEXT_ANNOTATION",
        total_volume=10,
        target_daily_throughput=5,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        review_sampling_pct=50.0,  # 50% sampling target required
        target_quality_pct=90.0,
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    # Create 10 submitted tasks
    t_list = []
    for i in range(10):
        t = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
        t_list.append(t)
    db_session.add_all(t_list)
    db_session.commit()

    # Sample tasks: 5 sent to review, 5 auto-completed unsampled
    sample_res = client.post(f"/api/v1/campaigns/{campaign.id}/reviews/sample").json()
    assert sample_res["tasks_sent_to_review"] == 5
    assert sample_res["tasks_auto_completed"] == 5

    # VERIFY: Unsampled completed tasks created NO Review records!
    review_records = db_session.query(Review).filter(Review.campaign_id == campaign.id).all()
    assert len(review_records) == 0

    # VERIFY: Delivery check before any human review returns INSUFFICIENT_QA_EVIDENCE
    deliv = client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()
    assert deliv["status"] == "NOT_READY"

    qual_gate = next(g for g in deliv["gates"] if g["gate"] == "QUALITY_TARGET_MET")
    assert qual_gate["passed"] is False
    assert "INSUFFICIENT_QA_EVIDENCE" in qual_gate["reason"]
    assert any("INSUFFICIENT_QA_EVIDENCE" in r for r in deliv["blocking_reasons"])

    # Now add 1 ACCEPT review
    reviewer = Worker(name="Reviewer QA", email="qa_rev@example.com", role="REVIEWER")
    db_session.add(reviewer)
    db_session.commit()

    task_in_review = db_session.query(Task).filter(Task.campaign_id == campaign.id, Task.state == "IN_REVIEW").first()
    client.post("/api/v1/reviews", json={
        "task_id": task_in_review.id,
        "reviewer_id": reviewer.id,
        "verdict": "ACCEPT"
    })

    # VERIFY: QA acceptance rate denominator is 1 (only the reviewed task), yielding 100.0% QA acceptance rate
    deliv_after = client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()
    qual_gate_after = next(g for g in deliv_after["gates"] if g["gate"] == "QUALITY_TARGET_MET")
    assert qual_gate_after["passed"] is True
    assert "100.0%" in qual_gate_after["reason"]
    assert qual_gate_after["evidence"] == "100.0% vs 90.0%"
