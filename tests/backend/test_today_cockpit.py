def test_today_manager_cockpit(client):
    res = client.get("/api/v1/today")
    assert res.status_code == 200
    data = res.json()
    assert "critical_campaigns" in data
    assert "at_risk_campaigns" in data
    assert "critical_escalations" in data
    assert "review_backlogs" in data
    assert "blocked_work" in data
    assert "rework_items" in data
    assert "delivery_candidates" in data
