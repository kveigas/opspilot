def test_date_scoped_capacity(client):
    w_res = client.post("/api/v1/workers", json={
        "name": "Capacity Worker",
        "email": "cap_worker@example.com",
        "role": "ANNOTATOR",
        "default_max_daily_capacity": 30
    })
    worker_id = w_res.json()["id"]

    # Initial get creates fallback default capacity
    get_res = client.get(f"/api/v1/workers/{worker_id}/capacity?date=2026-08-11")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["capacity_date"] == "2026-08-11"
    assert data["max_daily_capacity"] == 30
    assert data["allocated_for_date"] == 0
    assert data["remaining_capacity_for_date"] == 30

    # Upsert specific date capacity
    upsert_res = client.post("/api/v1/workers/capacity", json={
        "worker_id": worker_id,
        "capacity_date": "2026-08-11",
        "max_daily_capacity": 40,
        "allocated_for_date": 15
    })
    assert upsert_res.status_code == 201
    cap_data = upsert_res.json()
    assert cap_data["max_daily_capacity"] == 40
    assert cap_data["allocated_for_date"] == 15
    assert cap_data["remaining_capacity_for_date"] == 25


def test_reject_invalid_capacity_values(client):
    w_res = client.post("/api/v1/workers", json={
        "name": "Bound Worker",
        "email": "bound_worker@example.com",
        "role": "ANNOTATOR",
        "default_max_daily_capacity": 30
    })
    worker_id = w_res.json()["id"]

    # Reject allocated > max capacity
    res1 = client.post("/api/v1/workers/capacity", json={
        "worker_id": worker_id,
        "capacity_date": "2026-08-11",
        "max_daily_capacity": 30,
        "allocated_for_date": 35  # Invalid over-capacity
    })
    assert res1.status_code == 400
