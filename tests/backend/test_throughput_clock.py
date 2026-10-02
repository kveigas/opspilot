"""Throughput counts completions by operational day, not wall-clock time.

Regression for the live recheck finding F4: on the simulated demo, "Completed today" equalled every
completed task, because completed_at is wall-clock time and the whole demo runs within one real day.
"""
from datetime import UTC, date, datetime

from app.models.campaign import Campaign
from app.models.task import Task
from app.services.transition_service import transition_task_state

CAMP = "demo-campaign-ai-eval"


def _throughput(client, campaign_id):
    body = client.get(f"/api/v1/campaigns/{campaign_id}/execution").json()
    return body["state_counts"]["COMPLETED"], body["throughput"]


def test_simulated_demo_counts_by_simulated_day(client, db_session):
    client.post("/api/v1/demo/bootstrap")
    start = client.get(f"/api/v1/campaigns/{CAMP}").json()["operational_date"]

    completed, tp = _throughput(client, CAMP)
    assert completed == 600
    assert tp["simulated_clock"] is True
    assert tp["reference_date"] == start
    # Seeded history has no completion day, so it is not reported as completed "today".
    assert tp["completed_today"] == 0
    assert tp["completed_last_7_days"] == 0

    worked = client.post("/api/v1/demo/advance-workday").json()
    assert worked["worked_date"] == start

    completed_after, tp = _throughput(client, CAMP)
    finished_on_worked_day = completed_after - completed
    assert finished_on_worked_day > 0
    assert tp["reference_date"] == worked["operational_date"] != start
    # The work happened on the previous simulated day: not "today", but inside the 7-day window.
    assert tp["completed_today"] == 0
    assert tp["completed_last_7_days"] == finished_on_worked_day
    days = {t.completed_on for t in db_session.query(Task).filter(Task.campaign_id == CAMP, Task.completed_on.isnot(None))}
    assert days == {date.fromisoformat(start)}


def test_real_campaign_counts_by_utc_date(client, db_session):
    campaign = Campaign(name="Real clock", client_name="QA", task_type="TEXT_ANNOTATION", total_volume=3,
                        target_daily_throughput=1, start_date=date(2026, 8, 1), due_date=date(2026, 8, 30))
    db_session.add(campaign)
    db_session.commit()
    fresh = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="ACCEPTED")
    # A row completed before completed_on existed still counts through completed_at.
    legacy = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED",
                  completed_at=datetime.now(UTC), completed_on=None)
    old = Task(campaign_id=campaign.id, task_type="TEXT_ANNOTATION", state="COMPLETED",
               completed_at=datetime(2020, 1, 1, tzinfo=UTC), completed_on=date(2020, 1, 1))
    db_session.add_all([fresh, legacy, old])
    db_session.commit()

    transition_task_state(db_session, fresh, "COMPLETED")
    db_session.commit()
    assert fresh.completed_on == datetime.now(UTC).date()

    completed, tp = _throughput(client, campaign.id)
    assert completed == 3
    assert tp["simulated_clock"] is False
    assert tp["reference_date"] == datetime.now(UTC).date().isoformat()
    assert tp["completed_today"] == 2
    assert tp["completed_last_7_days"] == 2
