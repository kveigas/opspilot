from time import perf_counter

import pytest
from app.models.audit import AuditLog
from app.models.escalation import Escalation
from app.models.review import Review
from app.models.task import Task, TaskSkill
from app.services import demo_service
from app.services.demo_service import advance_demo_workday, bootstrap_demo_scenario, reset_demo_scenario
from sqlalchemy import event


def test_workday_is_one_commit_and_reset_does_not_accumulate_skills(db_session):
    bootstrap_demo_scenario(db_session)
    commits = []
    def listener(session):
        commits.append(1)
    event.listen(db_session, "after_commit", listener)
    start = perf_counter()
    result = advance_demo_workday(db_session)
    elapsed = perf_counter() - start
    event.remove(db_session, "after_commit", listener)
    assert result["advanced_to_submitted"] == 400
    assert result["qa_accepted"] > 0
    assert len(commits) == 1
    print(f"Atomic workday: {elapsed:.3f}s; commits={len(commits)}")
    for _ in range(2):
        reset_demo_scenario(db_session)
        assert db_session.query(TaskSkill).count() == 2000


def test_workday_failure_rolls_back_tasks_reviews_and_audit(db_session, monkeypatch):
    bootstrap_demo_scenario(db_session)
    before = {t.id: t.state for t in db_session.query(Task).all()}
    audit_count = db_session.query(AuditLog).count()
    review_count = db_session.query(Review).count()  # Seeded historical QA evidence.
    original = demo_service.transition_task_state
    calls = 0

    def fail_partway(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 5:
            raise RuntimeError("injected storage failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(demo_service, "transition_task_state", fail_partway)
    with pytest.raises(RuntimeError, match="injected"):
        advance_demo_workday(db_session)
    assert {t.id: t.state for t in db_session.query(Task).all()} == before
    assert db_session.query(Review).count() == review_count
    assert db_session.query(AuditLog).count() == audit_count


def test_read_only_cockpit_counts_all_escalations(client, db_session):
    bootstrap_demo_scenario(db_session)
    db_session.add(Escalation(campaign_id=demo_service.DEMO_CAMPAIGN_ID, title="Noncritical issue",
                             description="Needs action", severity="HIGH", category="QUALITY",
                             status="OPEN", blocker=False))
    db_session.commit()
    count = db_session.query(AuditLog).count()
    for _ in range(2):
        cockpit = client.get("/api/v1/today").json()
        assert len(cockpit["open_escalations"]) == 2
        assert len(cockpit["critical_escalations"]) == 1
        assert client.get(f"/api/v1/campaigns/{demo_service.DEMO_CAMPAIGN_ID}/sla").status_code == 200
        assert client.get(f"/api/v1/campaigns/{demo_service.DEMO_CAMPAIGN_ID}/delivery-readiness").status_code == 200
    assert db_session.query(AuditLog).count() == count
    assert client.post("/api/v1/demo/advance-workday?campaign_id=real-client").status_code == 400
