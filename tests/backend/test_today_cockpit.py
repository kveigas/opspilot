def test_today_manager_cockpit(client):
    res = client.get("/api/v1/today")
    assert res.status_code == 200
    data = res.json()
    assert data["campaign_count"] == 0
    assert "critical_campaigns" in data
    assert "at_risk_campaigns" in data
    assert "critical_escalations" in data
    assert "review_backlogs" in data
    assert "blocked_work" in data
    assert "rework_items" in data
    assert "delivery_candidates" in data


def test_today_baseline_agrees_with_authoritative_operational_state(client):
    bootstrap = client.post("/api/v1/demo/bootstrap?reset=true")
    assert bootstrap.status_code == 200
    campaign_id = bootstrap.json()["campaign_id"]

    today = client.get("/api/v1/today").json()
    sla = client.get(f"/api/v1/campaigns/{campaign_id}/sla").json()
    delivery = client.get(f"/api/v1/campaigns/{campaign_id}/delivery-readiness").json()
    escalations = client.get(
        f"/api/v1/escalations?campaign_id={campaign_id}&status=OPEN&severity=CRITICAL"
    ).json()
    blocked_tasks = client.get(
        f"/api/v1/tasks?campaign_id={campaign_id}&state=BLOCKED&limit=1000"
    ).json()

    campaign = next(item for item in today["critical_campaigns"] if item["campaign_id"] == campaign_id)

    assert today["campaign_count"] == 1
    assert campaign["name"] == "Multilingual AI Response Evaluation"
    assert campaign["sla_status"] == sla["status"] == "CRITICAL"
    assert campaign["delivery_status"] == delivery["status"] == "NOT_READY"
    assert campaign["reason_codes"] == sla["reason_codes"]
    assert campaign["open_critical_escalation_count"] == len(escalations) == 1
    assert campaign["blocked_count"] == len(blocked_tasks) == 50
    assert campaign["unallocated_count"] == 800
    assert campaign["review_backlog_count"] == 150
    assert campaign["available_capacity"] == sla["available_capacity"]
    assert len(today["open_escalations"]) == len(escalations)
    assert today["unallocated_backlog_summary"][0]["unallocated_count"] == 800
    assert today["qa_review_backlog_summary"][0]["review_backlog_count"] == 150
