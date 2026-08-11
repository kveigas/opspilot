def test_calibration_round_pass_retry_fail(client):
    # 1. Create Campaign
    c_res = client.post("/api/v1/campaigns", json={
        "name": "Calib Test Campaign",
        "client_name": "QA",
        "task_type": "PREFERENCE_RANKING",
        "total_volume": 500,
        "target_daily_throughput": 50,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20",
        "calibration_required": True
    })
    campaign_id = c_res.json()["id"]

    # 2. Create Calibration Round (pass threshold 90%, max attempts 2)
    r_res = client.post("/api/v1/calibrations", json={
        "campaign_id": campaign_id,
        "domain_tag": "de",
        "total_test_tasks": 10,
        "pass_threshold_pct": 90.0,
        "max_allowed_attempts": 2
    })
    assert r_res.status_code == 201
    round_id = r_res.json()["id"]

    # 3. Create Workers
    w1_res = client.post("/api/v1/workers", json={
        "name": "Pass Worker", "email": "pass@example.com", "role": "ANNOTATOR"
    })
    w2_res = client.post("/api/v1/workers", json={
        "name": "Fail Worker", "email": "fail@example.com", "role": "ANNOTATOR"
    })
    w1_id = w1_res.json()["id"]
    w2_id = w2_res.json()["id"]

    # 4. Worker 1 Passes on Attempt 1 (95% >= 90%)
    res_w1 = client.post(f"/api/v1/calibrations/{round_id}/results", json={
        "worker_id": w1_id, "score_pct": 95.0
    })
    assert res_w1.status_code == 201
    assert res_w1.json()["passed"] is True

    # Check Worker 1 qualification status
    w1_check = client.get(f"/api/v1/workers/{w1_id}").json()
    assert w1_check["qualifications"][0]["status"] == "PASSED"

    # 5. Worker 2 Scores 80% on Attempt 1 (Attempt 1/2 -> RETRY_REQUIRED)
    res_w2_att1 = client.post(f"/api/v1/calibrations/{round_id}/results", json={
        "worker_id": w2_id, "score_pct": 80.0
    })
    assert res_w2_att1.status_code == 201
    assert res_w2_att1.json()["passed"] is False

    w2_check1 = client.get(f"/api/v1/workers/{w2_id}").json()
    assert w2_check1["qualifications"][0]["status"] == "RETRY_REQUIRED"

    # 6. Worker 2 Scores 85% on Attempt 2 (Attempt 2/2 -> FAILED)
    res_w2_att2 = client.post(f"/api/v1/calibrations/{round_id}/results", json={
        "worker_id": w2_id, "score_pct": 85.0
    })
    assert res_w2_att2.status_code == 201

    w2_check2 = client.get(f"/api/v1/workers/{w2_id}").json()
    assert w2_check2["qualifications"][0]["status"] == "FAILED"

    # 7. Attempt 3 should be rejected with 400 Bad Request
    res_w2_att3 = client.post(f"/api/v1/calibrations/{round_id}/results", json={
        "worker_id": w2_id, "score_pct": 95.0
    })
    assert res_w2_att3.status_code == 400
    assert "exceeded maximum allowed attempts" in res_w2_att3.json()["detail"]
