import math
from datetime import date

import pytest
from app.models.campaign import Campaign, CampaignSkill
from app.models.review import Review
from app.models.task import Task, TaskSkill
from app.models.worker import Worker, WorkerSkill
from app.services.allocation_service import trigger_allocation_run
from app.services.quality_service import (
    assess_worker,
    estimate_first_pass_quality,
    plan_review_sample,
    trust_by_worker,
)
from app.services.review_service import process_review_sampling_for_submitted_tasks
from app.services.stats import beta_cdf, beta_ppf, stable_unit_interval

# Reference values computed with scipy.stats.beta (SciPy 1.x) during development.
CDF_REFERENCES = [
    (0.95, 14, 1, 0.4876749791155296),
    (0.95, 30, 2, 0.5365969098573434),
    (0.9, 3.5, 1.5, 0.8526158035593171),
    (0.5, 2, 2, 0.5),
    (0.99, 120, 3, 0.8759870249798819),
    (0.2, 0.7, 5.3, 0.8000187527003753),
]
PPF_REFERENCES = [
    (0.05, 30, 2, 0.8559096086816552),
    (0.95, 30, 2, 0.9884146841385564),
    (0.05, 2, 1, 0.22360679774997896),
    (0.05, 1.5, 8.5, 0.01991908855633613),
    (0.95, 200, 4, 0.9932420688530365),
]


@pytest.mark.parametrize(("x", "a", "b", "expected"), CDF_REFERENCES)
def test_beta_cdf_matches_scipy(x, a, b, expected):
    assert beta_cdf(x, a, b) == pytest.approx(expected, abs=1e-10)


@pytest.mark.parametrize(("q", "a", "b", "expected"), PPF_REFERENCES)
def test_beta_ppf_matches_scipy(q, a, b, expected):
    assert beta_ppf(q, a, b) == pytest.approx(expected, abs=1e-9)


def test_stats_edge_cases():
    assert beta_cdf(0.0, 2, 3) == 0.0 and beta_cdf(1.0, 2, 3) == 1.0
    with pytest.raises(ValueError):
        beta_cdf(0.5, 0, 1)
    with pytest.raises(ValueError):
        beta_ppf(1.5, 1, 1)
    assert stable_unit_interval("a", "b") == stable_unit_interval("a", "b")
    assert 0.0 <= stable_unit_interval("x") < 1.0


def _campaign(db, policy="ADAPTIVE", sampling=20.0, target=95.0, name="Adaptive QA"):
    campaign = Campaign(name=name, client_name="Synthetic", task_type="TEXT_ANNOTATION", total_volume=400,
                        target_daily_throughput=50, start_date=date(2026, 8, 1), due_date=date(2026, 8, 30),
                        calibration_required=False, review_sampling_pct=sampling, target_quality_pct=target,
                        qa_policy=policy)
    db.add(campaign)
    db.flush()
    return campaign


def _worker(db, key, role="ANNOTATOR"):
    worker = Worker(id=f"w-{key}", name=f"Worker {key}", email=f"{key}@example.com", role=role,
                    default_max_daily_capacity=100)
    db.add(worker)
    db.flush()
    db.add(WorkerSkill(worker_id=worker.id, skill_tag="en"))
    return worker


def _history(db, campaign, worker, accepted, rejected, reviewer):
    for index in range(accepted + rejected):
        task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED",
                    assigned_worker_id=worker.id, qa_sample_probability=1.0, qa_sampling_tier="HISTORICAL")
        db.add(task)
        db.flush()
        db.add(Review(task_id=task.id, campaign_id=campaign.id, reviewer_id=reviewer.id,
                      verdict="ACCEPT" if index < accepted else "REWORK",
                      reason_code=None if index < accepted else "LABEL_ERROR"))
    db.flush()


def test_tiers_follow_posterior_probability_of_meeting_target(db_session):
    campaign = _campaign(db_session)
    assert assess_worker(campaign, "new", 3, 0).tier == "PROBATION"
    trusted = assess_worker(campaign, "strong", 40, 0)
    assert trusted.tier == "TRUSTED" and trusted.prob_meets_target == pytest.approx(1 - 0.95**41)
    assert trusted.sampling_rate == pytest.approx(0.05)
    weak = assess_worker(campaign, "weak", 30, 8)
    assert weak.tier == "AT_RISK" and weak.sampling_rate == 1.0
    middling = assess_worker(campaign, "mid", 30, 1)
    assert middling.tier == "STANDARD" and middling.sampling_rate == pytest.approx(0.20)
    assert weak.lower_90 < weak.posterior_mean < weak.upper_90


def test_adaptive_sampling_is_stratified_and_records_inclusion_probabilities(db_session):
    campaign = _campaign(db_session)
    reviewer = _worker(db_session, "rev", role="REVIEWER")
    strong, weak, new = _worker(db_session, "strong"), _worker(db_session, "weak"), _worker(db_session, "new")
    _history(db_session, campaign, strong, 40, 0, reviewer)
    _history(db_session, campaign, weak, 30, 8, reviewer)
    tiers = {w: t.tier for w, t in trust_by_worker(db_session, campaign).items()}
    assert tiers == {strong.id: "TRUSTED", weak.id: "AT_RISK"}

    for worker in (strong, weak, new):
        for _ in range(20):
            db_session.add(Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED",
                                assigned_worker_id=worker.id))
    db_session.commit()

    result = process_review_sampling_for_submitted_tasks(db_session, campaign.id)
    assert result["qa_policy"] == "ADAPTIVE"
    sent = result["sent_to_review_by_tier"]
    assert sent["AT_RISK"] == 20
    assert sent.get("TRUSTED", 0) <= 4  # Expected 1 of 20 at a 5% rate.
    assert 4 <= sent["PROBATION"] <= 16  # Expected 10 of 20 at a 50% rate.
    live = db_session.query(Task).filter(Task.qa_sampling_tier.in_(["TRUSTED", "AT_RISK", "PROBATION"])).all()
    by_tier = {t.qa_sampling_tier: t.qa_sample_probability for t in live}
    assert by_tier == {"TRUSTED": pytest.approx(0.05), "AT_RISK": 1.0, "PROBATION": 0.5}
    assert all(t.state == "IN_REVIEW" for t in live if t.assigned_worker_id == weak.id)


def test_adaptive_rate_holds_when_work_arrives_one_task_at_a_time(db_session):
    campaign = _campaign(db_session)
    reviewer = _worker(db_session, "rev", role="REVIEWER")
    trusted = [_worker(db_session, f"t{i}") for i in range(60)]
    for worker in trusted:
        _history(db_session, campaign, worker, 40, 0, reviewer)
    single_tasks = [Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED", assigned_worker_id=w.id)
                    for w in trusted]
    db_session.add_all(single_tasks)
    db_session.commit()
    plan = plan_review_sample(db_session, campaign, single_tasks)
    # One task per trusted annotator must not round up to 100% review.
    assert sum(chosen for _, chosen, _, _ in plan) <= 10
    assert {p for _, _, p, _ in plan} == {0.05}


def test_flat_sampling_is_random_not_oldest_first(db_session):
    campaign = _campaign(db_session, policy="FLAT", sampling=10.0)
    tasks = [Task(id=f"flat-{i:03d}", campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="SUBMITTED")
             for i in range(100)]
    db_session.add_all(tasks)
    db_session.commit()
    plan = plan_review_sample(db_session, campaign, tasks)
    selected = [t.id for t, chosen, _, _ in plan if chosen]
    assert len(selected) == 10
    assert selected != [f"flat-{i:03d}" for i in range(10)]
    assert {p for _, _, p, _ in plan} == {0.1}
    # Reproducible: the same tasks produce the same sample.
    assert selected == [t.id for t, chosen, _, _ in plan_review_sample(db_session, campaign, tasks) if chosen]


def test_quality_estimate_is_inverse_probability_weighted(db_session):
    campaign = _campaign(db_session)
    reviewer = _worker(db_session, "rev", role="REVIEWER")
    # One failure reviewed at p=1.0 (weight 1) and one pass reviewed at p=0.1 (weight 10):
    # the pass represents ten tasks, so the design-weighted rate is 10/11, not 1/2.
    for verdict, probability in (("REWORK", 1.0), ("ACCEPT", 0.1)):
        task = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED",
                    qa_sample_probability=probability)
        db_session.add(task)
        db_session.flush()
        db_session.add(Review(task_id=task.id, campaign_id=campaign.id, reviewer_id=reviewer.id, verdict=verdict,
                              reason_code="LABEL_ERROR" if verdict == "REWORK" else None))
    db_session.commit()
    estimate = estimate_first_pass_quality(db_session, campaign)
    assert estimate["estimate"] == pytest.approx(10 / 11)
    assert estimate["unweighted_rate"] == pytest.approx(0.5)
    assert estimate["effective_sample_size"] == pytest.approx(121 / 101)
    assert estimate["lower_90"] < estimate["estimate"] < estimate["upper_90"]


def test_quality_report_and_delivery_gate_use_delivered_accuracy(client, db_session):
    campaign = _campaign(db_session, sampling=20.0, target=90.0)
    reviewer = _worker(db_session, "rev", role="REVIEWER")
    strong = _worker(db_session, "strong")
    _history(db_session, campaign, strong, 40, 0, reviewer)
    for _ in range(10):
        db_session.add(Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED",
                            assigned_worker_id=strong.id, qa_sample_probability=0.05, qa_sampling_tier="TRUSTED"))
    db_session.commit()

    report = client.get(f"/api/v1/campaigns/{campaign.id}/quality").json()
    assert report["qa_policy"] == "ADAPTIVE"
    assert report["workers"][0]["tier"] == "TRUSTED"
    residual = report["residual_error"]
    assert residual["unreviewed_completed_tasks"] == 10
    assert residual["expected_undetected_errors"] == pytest.approx(10 * (1 - 41 / 42), abs=0.1)
    assert report["review_effort"]["tasks_by_sampling_tier"] == {"TRUSTED": 10}
    assert report["review_effort"]["review_effort_ratio"] == pytest.approx(0.25)

    gate = next(g for g in client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()["gates"]
                if g["gate"] == "QUALITY_TARGET_MET")
    assert gate["passed"] is True
    assert gate["reason"].startswith("Estimated delivered accuracy")

    # Required reviews follow the recorded design: 40 tasks at p=1.0 plus 10 at p=0.05.
    review_gate = next(g for g in client.get(f"/api/v1/campaigns/{campaign.id}/delivery-readiness").json()["gates"]
                       if g["gate"] == "REVIEW_REQUIREMENT_COMPLETE")
    assert review_gate["evidence"] == f"40/{math.ceil(40 + 10 * 0.05)}"


def test_quality_aware_routing_sends_high_priority_work_to_trusted_annotators(client, db_session):
    campaign = _campaign(db_session, name="Routing")
    db_session.add(CampaignSkill(campaign_id=campaign.id, skill_tag="en"))
    reviewer = _worker(db_session, "rev", role="REVIEWER")
    weak, strong = _worker(db_session, "a-weak"), _worker(db_session, "z-strong")
    _history(db_session, campaign, strong, 40, 0, reviewer)
    _history(db_session, campaign, weak, 30, 8, reviewer)
    urgent = [Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", priority="URGENT") for _ in range(4)]
    routine = [Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", priority="LOW") for _ in range(4)]
    db_session.add_all(urgent + routine)
    db_session.flush()
    for task in urgent + routine:
        db_session.add(TaskSkill(task_id=task.id, skill_tag="en"))
    db_session.commit()

    response = client.post("/api/v1/allocations/trigger", json={
        "campaign_id": campaign.id, "operational_date": "2026-08-12", "strategy": "QUALITY_AWARE"})
    assert response.status_code == 201 and response.json()["strategy"] == "QUALITY_AWARE"
    assert {t.assigned_worker_id for t in urgent} == {strong.id}
    assert {t.assigned_worker_id for t in routine} == {strong.id, weak.id}  # Balanced for routine work.
    allocations = client.get(f"/api/v1/allocations?campaign_id={campaign.id}").json()
    assert any("routed to TRUSTED annotator" in (a["reason"] or "") for a in allocations)

    assert client.post("/api/v1/allocations/trigger", json={
        "campaign_id": campaign.id, "strategy": "OPTIMAL"}).status_code == 422

    # Two equally trusted annotators share high-priority work instead of one absorbing it all.
    twin = _worker(db_session, "z-strong-twin")
    _history(db_session, campaign, twin, 40, 0, reviewer)
    more_urgent = [Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", priority="URGENT") for _ in range(6)]
    db_session.add_all(more_urgent)
    db_session.flush()
    for task in more_urgent:
        db_session.add(TaskSkill(task_id=task.id, skill_tag="en"))
    db_session.commit()
    trigger_allocation_run(db_session, campaign.id, date(2026, 8, 13), strategy="QUALITY_AWARE")
    assert {t.assigned_worker_id for t in more_urgent} == {strong.id, twin.id}
    with pytest.raises(Exception, match="Unknown allocation strategy"):
        trigger_allocation_run(db_session, campaign.id, date(2026, 8, 12), strategy="OPTIMAL")
