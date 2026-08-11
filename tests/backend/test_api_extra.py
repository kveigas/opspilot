def test_qualifications_check_endpoint(client):
    c_res = client.post("/api/v1/campaigns", json={
        "name": "Qual Check Campaign",
        "client_name": "QA",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 500,
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
        "calibration_required": False
    })
    c_id = c_res.json()["id"]

    w_res = client.post("/api/v1/workers", json={
        "name": "Qual Check Worker",
        "email": "qual_check@example.com",
        "role": "ANNOTATOR"
    })
    w_id = w_res.json()["id"]

    res = client.get(f"/api/v1/qualifications/check?worker_id={w_id}&campaign_id={c_id}")
    assert res.status_code == 200
    assert res.json()["qualified"] is True


def test_update_campaign_endpoint(client):
    c_res = client.post("/api/v1/campaigns", json={
        "name": "Update Campaign",
        "client_name": "QA",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 500,
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
    })
    c_id = c_res.json()["id"]

    up_res = client.patch(f"/api/v1/campaigns/{c_id}", json={
        "status": "PAUSED",
        "priority": "URGENT"
    })
    assert up_res.status_code == 200
    assert up_res.json()["status"] == "PAUSED"
    assert up_res.json()["priority"] == "URGENT"


def test_capacity_patch_and_list_endpoints(client):
    w_res = client.post("/api/v1/workers", json={
        "name": "Cap List Worker",
        "email": "cap_list@example.com",
        "role": "ANNOTATOR"
    })
    w_id = w_res.json()["id"]

    upsert_res = client.post("/api/v1/workers/capacity", json={
        "worker_id": w_id,
        "capacity_date": "2026-08-11",
        "max_daily_capacity": 30,
        "allocated_for_date": 5
    })
    cap_id = upsert_res.json()["id"]

    patch_res = client.patch(f"/api/v1/workers/capacity/{cap_id}", json={
        "max_daily_capacity": 35,
        "allocated_for_date": 10
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["remaining_capacity_for_date"] == 25

    list_res = client.get(f"/api/v1/workers/{w_id}/capacities")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1


def test_calibration_get_endpoints(client):
    c_res = client.post("/api/v1/campaigns", json={
        "name": "Calib Get Campaign",
        "client_name": "QA",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 500,
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
    })
    c_id = c_res.json()["id"]

    r_res = client.post("/api/v1/calibrations", json={
        "campaign_id": c_id,
        "domain_tag": "medical",
        "total_test_tasks": 10,
        "pass_threshold_pct": 90.0,
        "max_allowed_attempts": 2
    })
    r_id = r_res.json()["id"]

    get_round = client.get(f"/api/v1/calibrations/{r_id}")
    assert get_round.status_code == 200

    list_rounds = client.get(f"/api/v1/calibrations?campaign_id={c_id}")
    assert list_rounds.status_code == 200
    assert len(list_rounds.json()) == 1


def test_root_endpoint(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "OpsPilot API" in res.json()["message"]
