def test_create_worker_valid(client):
    payload = {
        "name": "Anna Weber",
        "email": "anna.weber@example.com",
        "role": "ANNOTATOR",
        "timezone": "UTC",
        "default_max_daily_capacity": 35,
        "availability": "AVAILABLE",
        "is_active": True,
        "skills": ["de", "rlhf_safety"]
    }
    res = client.post("/api/v1/workers", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Anna Weber"
    assert "de" in data["skills"]


def test_create_worker_duplicate_email(client):
    payload = {
        "name": "Anna Weber",
        "email": "duplicate@example.com",
        "role": "ANNOTATOR",
        "default_max_daily_capacity": 30,
        "skills": ["de"]
    }
    res1 = client.post("/api/v1/workers", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/workers", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]


def test_worker_invalid_role(client):
    payload = {
        "name": "Invalid Role Worker",
        "email": "invalid_role@example.com",
        "role": "SUPERVISOR",  # Invalid role enum
        "default_max_daily_capacity": 30,
    }
    res = client.post("/api/v1/workers", json=payload)
    assert res.status_code == 422


def test_update_worker_profile(client):
    create_res = client.post("/api/v1/workers", json={
        "name": "Update Target",
        "email": "update_target@example.com",
        "role": "ANNOTATOR",
        "default_max_daily_capacity": 25,
        "availability": "AVAILABLE"
    })
    worker_id = create_res.json()["id"]

    update_res = client.patch(f"/api/v1/workers/{worker_id}", json={
        "availability": "BUSY",
        "default_max_daily_capacity": 40
    })
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["availability"] == "BUSY"
    assert data["default_max_daily_capacity"] == 40
