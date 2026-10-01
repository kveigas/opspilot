from datetime import UTC, date, datetime

from app.database import ensure_additive_columns
from app.models.campaign import Campaign, CampaignSkill
from app.models.ops import SimulationClock
from app.services.clock_service import advance_simulation_clock, get_operational_date, next_working_day
from app.services.demo_service import DEMO_CAMPAIGN_ID, DEMO_START_DATE, bootstrap_demo_scenario
from app.services.forecast_service import forecast_completion
from sqlalchemy import create_engine, inspect, text

CAMPAIGN = {
    "name": "Idempotent campaign",
    "client_name": "Synthetic",
    "task_type": "TEXT_ANNOTATION",
    "total_volume": 10,
    "target_daily_throughput": 5,
    "start_date": "2026-08-01",
    "due_date": "2026-08-30",
}


def test_idempotency_key_replays_instead_of_repeating_the_operation(client, db_session):
    headers = {"Idempotency-Key": "create-campaign-1"}
    first = client.post("/api/v1/campaigns", json=CAMPAIGN, headers=headers)
    assert first.status_code == 201
    replay = client.post("/api/v1/campaigns", json=CAMPAIGN, headers=headers)
    assert replay.status_code == 201
    assert replay.headers["Idempotent-Replayed"] == "true"
    assert replay.json()["id"] == first.json()["id"]
    assert db_session.query(Campaign).count() == 1

    changed = client.post("/api/v1/campaigns", json={**CAMPAIGN, "name": "Other"}, headers=headers)
    assert changed.status_code == 422
    # Without a key the normal duplicate-name validation still applies.
    assert client.post("/api/v1/campaigns", json=CAMPAIGN).status_code == 400
    assert client.post("/api/v1/campaigns", json=CAMPAIGN, headers={"Idempotency-Key": "x" * 101}).status_code == 422


def test_client_errors_are_replayed_but_server_errors_release_the_key(client, db_session, monkeypatch):
    headers = {"Idempotency-Key": "missing-campaign"}
    body = {"campaign_id": "nope"}
    assert client.post("/api/v1/allocations/trigger", json=body, headers=headers).status_code == 404
    replay = client.post("/api/v1/allocations/trigger", json=body, headers=headers)
    assert replay.status_code == 404 and replay.headers.get("Idempotent-Replayed") == "true"

    from app.api.v1 import demo as demo_routes

    def explode(*args, **kwargs):
        raise RuntimeError("storage offline")

    monkeypatch.setattr(demo_routes, "reset_demo_scenario", explode)
    from app.main import app
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=False) as raw:
        assert raw.post("/api/v1/demo/reset", headers={"Idempotency-Key": "reset-1"}).status_code == 500
        monkeypatch.undo()
        assert raw.post("/api/v1/demo/reset", headers={"Idempotency-Key": "reset-1"}).status_code == 200


def test_simulation_clock_keeps_demo_dates_meaningful(client, db_session):
    bootstrap_demo_scenario(db_session)
    assert get_operational_date(db_session, DEMO_CAMPAIGN_ID) == DEMO_START_DATE
    sla = client.get(f"/api/v1/campaigns/{DEMO_CAMPAIGN_ID}/sla").json()
    assert sla["simulated_clock"] is True and sla["operational_date"] == DEMO_START_DATE.isoformat()
    assert "CAMPAIGN_OVERDUE" not in sla["reason_codes"]

    advanced = client.post("/api/v1/demo/advance-workday").json()
    assert advanced["worked_date"] == "2026-08-11" and advanced["operational_date"] == "2026-08-12"
    assert next_working_day(date(2026, 8, 14)) == date(2026, 8, 17)  # Friday -> Monday

    db_session.add(SimulationClock(campaign_id="friday", operational_date=date(2026, 8, 14)))
    db_session.flush()
    assert advance_simulation_clock(db_session, "friday").operational_date == date(2026, 8, 17)
    assert get_operational_date(db_session, "real-campaign") == datetime.now(UTC).date()


def test_forecast_reports_dates_probability_and_assumptions(client, db_session):
    bootstrap_demo_scenario(db_session)
    forecast = client.get(f"/api/v1/campaigns/{DEMO_CAMPAIGN_ID}/forecast").json()
    assert forecast["status"] == "FORECAST"
    assert forecast["p50_date"] <= forecast["p90_date"]
    assert 0.0 <= forecast["probability_on_time"] <= 1.0
    assert len(forecast["assumptions"]) >= 4
    assert client.get(f"/api/v1/campaigns/{DEMO_CAMPAIGN_ID}/forecast").json() == forecast  # Deterministic

    empty = Campaign(name="No capacity", client_name="S", task_type="T", total_volume=5, target_daily_throughput=1,
                     start_date=date(2026, 8, 1), due_date=date(2026, 8, 30), calibration_required=False)
    db_session.add(empty)
    db_session.flush()
    db_session.add(CampaignSkill(campaign_id=empty.id, skill_tag="klingon"))  # Nobody has this skill.
    db_session.commit()
    assert forecast_completion(db_session, empty)["status"] == "NO_CAPACITY"


def test_timestamps_are_timezone_aware_and_task_history_is_complete(client, db_session):
    bootstrap_demo_scenario(db_session)
    log = client.get("/api/v1/audit-logs").json()[0]
    assert log["created_at"].endswith(("+00:00", "Z"))

    history = client.get("/api/v1/tasks/demo-task-0001/history").json()
    assert history["task"]["id"] == "demo-task-0001"
    assert history["task"]["qa_sampling_tier"] == "HISTORICAL"
    assert isinstance(history["events"], list) and isinstance(history["allocations"], list)
    assert client.get("/api/v1/tasks/unknown/history").status_code == 404


def test_additive_columns_upgrade_an_rc1_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'rc1.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tasks (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE campaigns (id VARCHAR(36) PRIMARY KEY)"))
    added = ensure_additive_columns(engine)
    assert set(added) == {"tasks.qa_sample_probability", "tasks.qa_sampling_tier", "campaigns.qa_policy"}
    assert "qa_policy" in {c["name"] for c in inspect(engine).get_columns("campaigns")}
    assert ensure_additive_columns(engine) == []  # Idempotent
