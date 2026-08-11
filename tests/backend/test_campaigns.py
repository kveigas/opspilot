def test_create_campaign_valid(client):
    payload = {
        "name": "Test Multilingual Campaign",
        "client_name": "AI Ops",
        "task_type": "PREFERENCE_RANKING",
        "description": "Validation campaign",
        "total_volume": 1000,
        "target_quality_pct": 95.0,
        "review_sampling_pct": 20.0,
        "target_daily_throughput": 100,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
        "priority": "HIGH",
        "calibration_required": True,
        "required_annotators": 5,
        "required_reviewers": 2,
        "required_skills": ["de", "rlhf"]
    }
    res = client.post("/api/v1/campaigns", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Test Multilingual Campaign"
    assert data["total_volume"] == 1000
    assert "de" in data["required_skills"]


def test_create_campaign_invalid_volume(client):
    payload = {
        "name": "Invalid Volume Campaign",
        "client_name": "AI Ops",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 0,  # Invalid
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
    }
    res = client.post("/api/v1/campaigns", json=payload)
    assert res.status_code == 422


def test_create_campaign_invalid_dates(client):
    payload = {
        "name": "Invalid Date Campaign",
        "client_name": "AI Ops",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 500,
        "target_daily_throughput": 50,
        "start_date": "2026-08-20",
        "due_date": "2026-08-10",  # Invalid due <= start
    }
    res = client.post("/api/v1/campaigns", json=payload)
    assert res.status_code == 422


def test_create_campaign_invalid_review_sampling(client):
    payload = {
        "name": "Invalid Sampling Campaign",
        "client_name": "AI Ops",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 500,
        "review_sampling_pct": 150.0,  # Invalid > 100
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
    }
    res = client.post("/api/v1/campaigns", json=payload)
    assert res.status_code == 422


def test_get_campaign_retrieval_and_404(client):
    res_list = client.get("/api/v1/campaigns")
    assert res_list.status_code == 200
    assert isinstance(res_list.json(), list)

    res_404 = client.get("/api/v1/campaigns/non-existent-uuid")
    assert res_404.status_code == 404
