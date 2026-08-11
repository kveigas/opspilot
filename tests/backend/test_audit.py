def test_audit_log_recording(client):
    # Perform major action: create campaign
    c_res = client.post("/api/v1/campaigns", json={
        "name": "Audit Test Campaign",
        "client_name": "Audit Team",
        "task_type": "TEXT_ANNOTATION",
        "total_volume": 100,
        "target_daily_throughput": 20,
        "start_date": "2026-08-10",
        "due_date": "2026-08-20"
    })
    assert c_res.status_code == 201

    # Fetch audit logs
    audit_res = client.get("/api/v1/audit-logs")
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) >= 1
    actions = [l["action"] for l in logs]
    assert "CAMPAIGN_CREATED" in actions
