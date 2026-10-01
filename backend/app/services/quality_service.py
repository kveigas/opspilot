"""Trust-based adaptive QA: Bayesian annotator quality, review routing and unbiased estimates.

Method
------
* Each annotator's first-pass acceptance probability on a campaign has a Beta(1, 1) prior,
  updated with QA verdicts on that annotator's work (ACCEPT = pass; REWORK/BLOCK = fail;
  ESCALATE is a guideline/policy question and is excluded).
* The posterior probability that the annotator meets the campaign quality target places them
  in a tier: PROBATION (too little evidence), TRUSTED, STANDARD or AT_RISK.
* ADAPTIVE campaigns review each tier at a different rate (proven annotators at a floor
  rate, new or struggling annotators far more often). Selection is stratified sampling
  without replacement in a reproducible random order, and each task's inclusion probability
  is stored.
* Campaign quality is therefore estimated with inverse-probability (Hajek) weights, so
  reviewing weak annotators more often does not bias the reported acceptance rate.

This is the "dynamic percentage" / honeypot-trust practice used in production annotation QA,
made explicit and auditable. It is not a guarantee of delivered quality: estimates rely on
reviewer verdicts being correct and on the simulated/observed QA evidence.
"""

import math
from collections import defaultdict
from dataclasses import asdict, dataclass

from app.models.campaign import Campaign
from app.models.review import Review
from app.models.task import Task
from app.models.worker import Worker
from app.services.stats import beta_cdf, beta_ppf, stable_unit_interval
from sqlalchemy.orm import Session

PRIOR_ALPHA = 1.0
PRIOR_BETA = 1.0
MIN_REVIEWS_FOR_TRUST = 8
TRUSTED_CONFIDENCE = 0.80
AT_RISK_CONFIDENCE = 0.20
TRUSTED_RATE_FACTOR = 0.25
TRUSTED_RATE_FLOOR = 0.05
PROBATION_RATE = 0.50

PASS_VERDICTS = {"ACCEPT"}
FAIL_VERDICTS = {"REWORK", "BLOCK"}

TIER_ORDER = {"TRUSTED": 0, "STANDARD": 1, "PROBATION": 2, "AT_RISK": 3}
TIER_EXPLANATIONS = {
    "TRUSTED": "Strong QA record: at least 80% posterior probability of meeting the quality target.",
    "STANDARD": "Evidence is mixed or still accumulating; reviewed at the campaign's base rate.",
    "PROBATION": f"Fewer than {MIN_REVIEWS_FOR_TRUST} QA verdicts; reviewed heavily until a record exists.",
    "AT_RISK": "Likely below the quality target (under 20% posterior probability of meeting it); every task reviewed.",
}


@dataclass(frozen=True)
class WorkerTrust:
    worker_id: str
    reviews: int
    accepted: int
    rejected: int
    posterior_mean: float
    lower_90: float
    upper_90: float
    prob_meets_target: float
    tier: str
    sampling_rate: float


def policy_of(campaign: Campaign) -> str:
    return (campaign.qa_policy or "FLAT").upper()


def base_rate(campaign: Campaign) -> float:
    return max(0.0, min(1.0, float(campaign.review_sampling_pct) / 100.0))


def tier_sampling_rate(campaign: Campaign, tier: str) -> float:
    flat = base_rate(campaign)
    if flat == 0.0:
        return 0.0  # The campaign has opted out of QA sampling entirely.
    if tier == "TRUSTED":
        return max(TRUSTED_RATE_FLOOR, flat * TRUSTED_RATE_FACTOR)
    if tier == "PROBATION":
        return max(flat, PROBATION_RATE)
    if tier == "AT_RISK":
        return 1.0
    return flat


def assess_worker(campaign: Campaign, worker_id: str, accepted: int, rejected: int) -> WorkerTrust:
    alpha, beta = PRIOR_ALPHA + accepted, PRIOR_BETA + rejected
    target = float(campaign.target_quality_pct) / 100.0
    prob_meets_target = 1.0 - beta_cdf(target, alpha, beta)
    reviews = accepted + rejected
    if reviews < MIN_REVIEWS_FOR_TRUST:
        tier = "PROBATION"
    elif prob_meets_target >= TRUSTED_CONFIDENCE:
        tier = "TRUSTED"
    elif prob_meets_target < AT_RISK_CONFIDENCE:
        tier = "AT_RISK"
    else:
        tier = "STANDARD"
    return WorkerTrust(
        worker_id=worker_id,
        reviews=reviews,
        accepted=accepted,
        rejected=rejected,
        posterior_mean=alpha / (alpha + beta),
        lower_90=beta_ppf(0.05, alpha, beta),
        upper_90=beta_ppf(0.95, alpha, beta),
        prob_meets_target=prob_meets_target,
        tier=tier,
        sampling_rate=tier_sampling_rate(campaign, tier),
    )


def worker_outcomes(db: Session, campaign_id: str) -> dict[str, tuple[int, int]]:
    rows = (
        db.query(Task.assigned_worker_id, Review.verdict)
        .join(Review, Review.task_id == Task.id)
        .filter(Review.campaign_id == campaign_id, Task.assigned_worker_id.isnot(None))
        .all()
    )
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for worker_id, verdict in rows:
        if verdict in PASS_VERDICTS:
            counts[str(worker_id)][0] += 1
        elif verdict in FAIL_VERDICTS:
            counts[str(worker_id)][1] += 1
    return {worker_id: (values[0], values[1]) for worker_id, values in counts.items()}


def trust_by_worker(db: Session, campaign: Campaign) -> dict[str, WorkerTrust]:
    outcomes = worker_outcomes(db, campaign.id)
    worker_ids = {
        str(worker_id)
        for (worker_id,) in db.query(Task.assigned_worker_id)
        .filter(Task.campaign_id == campaign.id, Task.assigned_worker_id.isnot(None))
        .distinct()
        .all()
    } | set(outcomes)
    return {
        worker_id: assess_worker(campaign, worker_id, *outcomes.get(worker_id, (0, 0)))
        for worker_id in sorted(worker_ids)
    }


def _random_order(campaign_id: str, tasks: list[Task]) -> list[Task]:
    return sorted(tasks, key=lambda t: (stable_unit_interval("qa-sample", campaign_id, str(t.id)), str(t.id)))


def plan_review_sample(
    db: Session, campaign: Campaign, submitted: list[Task], flat_minimum: int | None = None
) -> list[tuple[Task, bool, float, str]]:
    """Return (task, selected, inclusion_probability, tier) for each submitted task.

    FLAT selects a fixed count uniformly at random (all tasks share one probability).
    ADAPTIVE uses Poisson sampling: each task is selected independently with its annotator's
    tier rate (a reproducible pseudo-random draw per task). Rounding per small batch would
    otherwise turn a 5% rate into 100% whenever work arrives a few tasks at a time.
    """
    if not submitted:
        return []
    if policy_of(campaign) != "ADAPTIVE":
        count = math.ceil(len(submitted) * base_rate(campaign))
        if flat_minimum is not None:
            count = min(len(submitted), max(count, flat_minimum))
        probability = count / len(submitted)
        ordered = _random_order(campaign.id, submitted)
        return [(task, index < count, probability, "FLAT") for index, task in enumerate(ordered)]

    trust = trust_by_worker(db, campaign)
    plan: list[tuple[Task, bool, float, str]] = []
    for task in sorted(submitted, key=lambda t: str(t.id)):
        assessment = trust.get(str(task.assigned_worker_id)) if task.assigned_worker_id else None
        tier = assessment.tier if assessment else "PROBATION"
        rate = tier_sampling_rate(campaign, tier)
        # Attempt-specific draw so re-submitted rework is not locked into its first outcome.
        draw = stable_unit_interval("qa-sample", campaign.id, str(task.id), str(task.rework_count))
        plan.append((task, draw < rate, rate, tier))
    return plan


def _inclusion_probability(task: Task, campaign: Campaign) -> float:
    if task.qa_sample_probability and task.qa_sample_probability > 0:
        return float(task.qa_sample_probability)
    fallback = base_rate(campaign)
    return fallback if fallback > 0 else 1.0


def estimate_first_pass_quality(db: Session, campaign: Campaign) -> dict | None:
    """Design-weighted first-pass acceptance with an approximate 90% credible interval."""
    reviews = (
        db.query(Review, Task)
        .join(Task, Task.id == Review.task_id)
        .filter(Review.campaign_id == campaign.id)
        .order_by(Review.created_at.asc(), Review.id.asc())
        .all()
    )
    first: dict[str, tuple[Review, Task]] = {}
    for review, task in reviews:
        if review.verdict in PASS_VERDICTS | FAIL_VERDICTS and task.id not in first:
            first[task.id] = (review, task)
    if not first:
        return None

    weights, outcomes = [], []
    for review, task in first.values():
        weights.append(1.0 / _inclusion_probability(task, campaign))
        outcomes.append(1.0 if review.verdict in PASS_VERDICTS else 0.0)
    total = math.fsum(weights)
    estimate = math.fsum(w * y for w, y in zip(weights, outcomes, strict=True)) / total
    effective_n = total**2 / math.fsum(w * w for w in weights)
    alpha = 1.0 + effective_n * estimate
    beta = 1.0 + effective_n * (1.0 - estimate)
    naive = sum(outcomes) / len(outcomes)
    return {
        "estimate": estimate,
        "lower_90": beta_ppf(0.05, alpha, beta),
        "upper_90": beta_ppf(0.95, alpha, beta),
        "reviews": len(outcomes),
        "effective_sample_size": effective_n,
        "unweighted_rate": naive,
    }


def residual_error_estimate(
    db: Session, campaign: Campaign, trust: dict[str, WorkerTrust], first_pass: dict | None
) -> dict:
    """Expected undetected errors among completed (deliverable) tasks.

    Reviewed tasks are assumed corrected by rework. Unreviewed completed tasks carry their
    annotator's posterior error rate, or the campaign's design-weighted first-pass error rate
    when the annotator has no QA record.
    """
    completed = (
        db.query(Task.id, Task.assigned_worker_id)
        .filter(Task.campaign_id == campaign.id, Task.state == "COMPLETED")
        .all()
    )
    reviewed = {task_id for (task_id,) in db.query(Review.task_id).filter(Review.campaign_id == campaign.id).distinct()}
    fallback = first_pass["estimate"] if first_pass else None
    expected_errors = 0.0
    unreviewed = 0
    estimable = True
    for task_id, worker_id in completed:
        if task_id in reviewed:
            continue
        unreviewed += 1
        assessment = trust.get(str(worker_id)) if worker_id else None
        quality = assessment.posterior_mean if assessment and assessment.reviews > 0 else fallback
        if quality is None:
            estimable = False
            continue
        expected_errors += 1.0 - quality
    rate = (expected_errors / len(completed)) if completed and estimable else None
    return {
        "completed_tasks": len(completed),
        "unreviewed_completed_tasks": unreviewed,
        "expected_undetected_errors": round(expected_errors, 1) if estimable else None,
        "estimated_residual_error_rate": rate,
        "estimated_delivered_accuracy": (1.0 - rate) if rate is not None else None,
    }


def review_effort(db: Session, campaign: Campaign) -> dict:
    # Seeded pre-policy history is excluded so the comparison covers live sampling decisions only.
    decided = [
        row
        for row in db.query(Task.qa_sample_probability, Task.qa_sampling_tier)
        .filter(Task.campaign_id == campaign.id, Task.qa_sample_probability.isnot(None))
        .all()
        if row[1] != "HISTORICAL"
    ]
    expected_reviews = math.fsum(float(p) for p, _ in decided)
    flat_reviews = len(decided) * base_rate(campaign)
    by_tier: dict[str, int] = defaultdict(int)
    for _, tier in decided:
        by_tier[tier or "UNKNOWN"] += 1
    return {
        "tasks_through_sampling": len(decided),
        "expected_reviews_under_policy": round(expected_reviews, 1),
        "expected_reviews_under_flat_policy": round(flat_reviews, 1),
        "review_effort_ratio": (expected_reviews / flat_reviews) if flat_reviews else None,
        "tasks_by_sampling_tier": dict(sorted(by_tier.items())),
    }


def campaign_quality_report(db: Session, campaign: Campaign) -> dict:
    trust = trust_by_worker(db, campaign)
    names = {w.id: w.name for w in db.query(Worker).filter(Worker.id.in_(list(trust))).all()} if trust else {}
    workers = sorted(
        ({**asdict(t), "worker_name": names.get(t.worker_id, t.worker_id)} for t in trust.values()),
        key=lambda row: (TIER_ORDER.get(row["tier"], 9), -row["posterior_mean"], row["worker_id"]),
    )
    tier_counts: dict[str, int] = defaultdict(int)
    for t in trust.values():
        tier_counts[t.tier] += 1
    first_pass = estimate_first_pass_quality(db, campaign)
    return {
        "campaign_id": campaign.id,
        "qa_policy": policy_of(campaign),
        "target_quality_pct": float(campaign.target_quality_pct),
        "base_sampling_pct": float(campaign.review_sampling_pct),
        "tier_sampling_pct": {tier: round(tier_sampling_rate(campaign, tier) * 100, 1) for tier in TIER_ORDER},
        "tier_explanations": TIER_EXPLANATIONS,
        "tier_counts": dict(tier_counts),
        "workers": workers,
        "first_pass_quality": first_pass,
        "residual_error": residual_error_estimate(db, campaign, trust, first_pass),
        "review_effort": review_effort(db, campaign),
        "method": [
            "Beta(1,1) prior per annotator, updated with QA verdicts on this campaign (ESCALATE excluded).",
            "Tier from posterior probability of meeting the target; review rate follows the tier under ADAPTIVE policy.",
            (
                "ADAPTIVE: each task sampled independently at its tier's rate (Poisson sampling); FLAT: fixed-size "
                "random sample. Inclusion probabilities are stored per task."
            ),
            "Campaign acceptance uses inverse-probability (Hajek) weights; interval uses the effective sample size.",
            (
                "Delivered accuracy assumes reviewed tasks are corrected by rework; unreviewed tasks keep their "
                "annotator's posterior error rate."
            ),
            "Estimates assume reviewer verdicts are correct. Demo outcomes are synthetic.",
        ],
    }
