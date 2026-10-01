"""Monte Carlo completion forecast with explicit, inspectable assumptions.

Each simulation draws the campaign's first-pass acceptance rate from its QA posterior and a
daily attendance factor, then advances working days until the remaining volume is complete.
Rework returns sampled-and-rejected tasks to the queue. This is a planning aid, not a
backtested prediction; its inputs are shown alongside the result.
"""

import math
import random
from datetime import date

from app.models.campaign import Campaign
from app.models.capacity import WorkerDailyCapacity
from app.models.task import Task
from app.models.worker import Worker
from app.services.clock_service import get_operational_date, next_working_day
from app.services.qualification_helper import is_worker_qualified_for_campaign
from app.services.quality_service import base_rate, estimate_first_pass_quality
from app.services.stats import stable_unit_interval
from sqlalchemy.orm import Session

SIMULATIONS = 2000
ATTENDANCE_RANGE = (0.85, 1.0)
NO_EVIDENCE_PRIOR_STRENGTH = 10.0
MAX_HORIZON_DAYS = 260


def _daily_capacity(db: Session, campaign: Campaign, operational_date: date) -> int:
    required = {s.skill_tag.lower().strip() for s in campaign.skills}
    total = 0
    for worker in db.query(Worker).filter(
        Worker.is_active.is_(True), Worker.availability == "AVAILABLE", Worker.role == "ANNOTATOR"
    ):
        if not required.issubset({s.skill_tag.lower().strip() for s in worker.skills}):
            continue
        if not is_worker_qualified_for_campaign(db, worker, campaign):
            continue
        row = (
            db.query(WorkerDailyCapacity)
            .filter(WorkerDailyCapacity.worker_id == worker.id, WorkerDailyCapacity.capacity_date == operational_date)
            .first()
        )
        total += int(row.max_daily_capacity if row else worker.default_max_daily_capacity)
    return total


def _expected_sampling_rate(db: Session, campaign: Campaign) -> float:
    recent = (
        db.query(Task.qa_sample_probability)
        .filter(
            Task.campaign_id == campaign.id,
            Task.qa_sample_probability.isnot(None),
            Task.qa_sampling_tier != "HISTORICAL",
        )
        .order_by(Task.updated_at.desc())
        .limit(500)
        .all()
    )
    if recent:
        return math.fsum(float(p) for (p,) in recent) / len(recent)
    return base_rate(campaign)


def _add_working_days(start: date, days: int) -> date:
    current = start
    for _ in range(max(0, days - 1)):
        current = next_working_day(current)
    return current


def forecast_completion(db: Session, campaign: Campaign) -> dict:
    operational_date = get_operational_date(db, campaign.id)
    existing = db.query(Task).filter(Task.campaign_id == campaign.id).count()
    completed = db.query(Task).filter(Task.campaign_id == campaign.id, Task.state == "COMPLETED").count()
    remaining = max(0, int(campaign.total_volume) - existing) + (existing - completed)
    capacity = _daily_capacity(db, campaign, operational_date)
    sampling_rate = _expected_sampling_rate(db, campaign)
    quality = estimate_first_pass_quality(db, campaign)

    if quality is not None:
        n_eff, mean = quality["effective_sample_size"], quality["estimate"]
        quality_basis = f"QA posterior (effective n={n_eff:.0f})"
    else:
        n_eff, mean = NO_EVIDENCE_PRIOR_STRENGTH, float(campaign.target_quality_pct) / 100.0
        quality_basis = "No QA evidence: weak prior centred on the campaign target"
    alpha, beta = 1.0 + n_eff * mean, 1.0 + n_eff * (1.0 - mean)

    base = {
        "campaign_id": campaign.id,
        "operational_date": operational_date,
        "due_date": campaign.due_date,
        "remaining_tasks": remaining,
        "daily_capacity": capacity,
        "expected_sampling_rate": sampling_rate,
        "first_pass_acceptance_mean": alpha / (alpha + beta),
        "simulations": SIMULATIONS,
        "assumptions": [
            f"Daily capacity {capacity} tasks from qualified, available annotators on {operational_date}.",
            f"Attendance varies uniformly between {int(ATTENDANCE_RANGE[0] * 100)}% and 100% each day.",
            f"First-pass acceptance drawn from {quality_basis}.",
            f"Sampled tasks ({sampling_rate:.0%} on average) that fail QA return for one more attempt.",
            "Weekends excluded. Escalations, blockers and reviewer capacity are not modelled.",
        ],
    }
    if remaining == 0:
        return {**base, "status": "COMPLETE", "p50_date": operational_date, "p90_date": operational_date,
                "probability_on_time": 1.0}
    if capacity == 0:
        return {**base, "status": "NO_CAPACITY", "p50_date": None, "p90_date": None, "probability_on_time": 0.0}

    seed = int(stable_unit_interval("forecast", campaign.id, str(operational_date), str(remaining)) * 2**32)
    rng = random.Random(seed)
    durations: list[int] = []
    for _ in range(SIMULATIONS):
        acceptance = rng.betavariate(alpha, beta)
        net_share = 1.0 - sampling_rate * (1.0 - acceptance)
        left, days = float(remaining), 0
        while left > 0 and days < MAX_HORIZON_DAYS:
            days += 1
            left -= capacity * rng.uniform(*ATTENDANCE_RANGE) * net_share
        durations.append(days)
    durations.sort()
    p50 = durations[len(durations) // 2]
    p90 = durations[min(len(durations) - 1, math.ceil(0.9 * len(durations)) - 1)]
    on_time = sum(1 for d in durations if _add_working_days(operational_date, d) <= campaign.due_date)
    return {
        **base,
        "status": "FORECAST",
        "p50_working_days": p50,
        "p90_working_days": p90,
        "p50_date": _add_working_days(operational_date, p50),
        "p90_date": _add_working_days(operational_date, p90),
        "probability_on_time": on_time / SIMULATIONS,
    }
