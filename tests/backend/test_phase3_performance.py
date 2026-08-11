import time
from datetime import date
from app.models.campaign import Campaign
from app.models.worker import Worker, WorkerSkill
from app.models.task import Task
from app.services.sla_service import evaluate_campaign_sla
from app.services.delivery_service import evaluate_delivery_readiness


def test_phase3_scale_performance_benchmark(db_session):
    # Setup campaign with 2,000 tasks and 16 workers
    campaign = Campaign(
        name="Phase 3 Benchmark Campaign",
        client_name="Scale Client",
        task_type="TEXT_ANNOTATION",
        total_volume=2000,
        target_daily_throughput=200,
        start_date=date(2026, 8, 10),
        due_date=date(2026, 8, 20),
        calibration_required=False,
    )
    db_session.add(campaign)
    db_session.commit()

    # Bulk create 16 workers
    workers = []
    for i in range(16):
        w = Worker(
            name=f"Scale Worker {i}",
            email=f"scale_w{i}@example.com",
            role="ANNOTATOR",
            default_max_daily_capacity=150,
        )
        workers.append(w)
    db_session.add_all(workers)
    db_session.flush()

    for w in workers:
        db_session.add(WorkerSkill(worker_id=w.id, skill_tag="nlp"))
    db_session.commit()

    # Bulk create 2,000 tasks
    tasks = []
    for i in range(2000):
        state = "COMPLETED" if i < 1200 else "SUBMITTED"
        t = Task(
            campaign_id=campaign.id,
            task_type="TEXT_ANNOTATION",
            state=state,
            external_reference=f"BENCH-{i}",
        )
        tasks.append(t)
    db_session.add_all(tasks)
    db_session.commit()

    # 1. Benchmark SLA Evaluation Timing
    t0 = time.perf_counter()
    sla_result = evaluate_campaign_sla(db_session, campaign.id, operational_date=date(2026, 8, 11))
    t_sla_ms = (time.perf_counter() - t0) * 1000.0

    # 2. Benchmark Delivery Readiness Timing
    t0 = time.perf_counter()
    delivery_result = evaluate_delivery_readiness(db_session, campaign.id)
    t_deliv_ms = (time.perf_counter() - t0) * 1000.0

    print(f"\n--- Phase 3 Scale Benchmarks (2,000 tasks / 16 workers) ---")
    print(f"SLA Evaluation Time: {t_sla_ms:.2f} ms")
    print(f"Delivery Readiness Time: {t_deliv_ms:.2f} ms")

    assert sla_result["campaign_id"] == campaign.id
    assert delivery_result["campaign_id"] == campaign.id
    assert t_sla_ms < 1000.0, f"SLA evaluation exceeded 1,000ms threshold: {t_sla_ms:.2f}ms"
    assert t_deliv_ms < 1000.0, f"Delivery readiness evaluation exceeded 1,000ms threshold: {t_deliv_ms:.2f}ms"
