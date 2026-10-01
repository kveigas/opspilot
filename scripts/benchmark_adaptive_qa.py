"""Budget-matched comparison of ADAPTIVE (trust-based) versus FLAT QA sampling.

For each synthetic world, annotators have hidden first-pass accuracies (most strong, some
weak). Work arrives daily. ADAPTIVE learns annotator tiers only from its own QA verdicts and
samples by tier. FLAT then receives exactly the same number of reviews, spread uniformly.
Reviewed errors are corrected; unreviewed errors ship. The comparison metric is the share of
delivered tasks with an undetected error at an equal review budget.

This uses OpsPilot's production tiering code (quality_service.assess_worker). Worlds are
synthetic; results are evidence about the policy under these assumptions, not a claim about
any real annotation workforce.

Usage (from the repository root):
    python scripts/benchmark_adaptive_qa.py --worlds 40 --output docs/evidence/adaptive_qa_benchmark.json
"""

import argparse
import json
import math
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.models.campaign import Campaign
from app.services.quality_service import assess_worker, tier_sampling_rate

ANNOTATORS = 12
DAYS = 10
TASKS_PER_ANNOTATOR_PER_DAY = 40
WEAK_SHARE = 0.25


def make_world(seed: int) -> list[float]:
    rng = random.Random(seed)
    weak = set(rng.sample(range(ANNOTATORS), k=round(ANNOTATORS * WEAK_SHARE)))
    return [rng.betavariate(85, 15) if i in weak else rng.betavariate(97, 3) for i in range(ANNOTATORS)]


def make_outcomes(accuracies: list[float], seed: int) -> list[list[list[bool]]]:
    """outcomes[day][worker][task] = first-pass correct. Shared by every policy (paired design)."""
    rng = random.Random(seed)
    return [[[rng.random() < accuracies[w] for _ in range(TASKS_PER_ANNOTATOR_PER_DAY)] for w in range(ANNOTATORS)]
            for _ in range(DAYS)]


def run_policy(outcomes: list[list[list[bool]]], seed: int, campaign: Campaign, flat_rate: float | None) -> dict:
    # Poisson sampling, as in production: each task is reviewed independently with its rate.
    rng = random.Random(seed)
    accepted = [0] * ANNOTATORS
    rejected = [0] * ANNOTATORS
    reviews = shipped_errors = total = 0
    for day in outcomes:
        for worker, tasks in enumerate(day):
            if flat_rate is None:
                tier = assess_worker(campaign, str(worker), accepted[worker], rejected[worker]).tier
                rate = tier_sampling_rate(campaign, tier)
            else:
                rate = flat_rate
            for correct in tasks:
                total += 1
                if rng.random() < rate:
                    reviews += 1
                    if correct:
                        accepted[worker] += 1
                    else:
                        rejected[worker] += 1  # Detected and corrected by rework.
                elif not correct:
                    shipped_errors += 1
    return {"reviews": reviews, "tasks": total, "residual_error_rate": shipped_errors / total}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--worlds", type=int, default=40)
    parser.add_argument("--base-rate", type=float, default=20.0, help="Campaign base sampling percent")
    parser.add_argument("--target", type=float, default=95.0, help="Campaign quality target percent")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    campaign = Campaign(review_sampling_pct=args.base_rate, target_quality_pct=args.target, qa_policy="ADAPTIVE")
    rows = []
    for world in range(args.worlds):
        accuracies = make_world(1000 + world)
        outcomes = make_outcomes(accuracies, 3000 + world)
        adaptive = run_policy(outcomes, 5000 + world, campaign, flat_rate=None)
        matched_rate = adaptive["reviews"] / adaptive["tasks"]
        flat_matched = run_policy(outcomes, 7000 + world, campaign, flat_rate=matched_rate)
        flat_base = run_policy(outcomes, 7000 + world, campaign, flat_rate=args.base_rate / 100)
        # Smallest flat rate (to 1 percentage point) whose residual error is no worse than ADAPTIVE's.
        flat_equal_quality = next(
            result
            for result in (run_policy(outcomes, 7000 + world, campaign, flat_rate=rate / 100) for rate in range(1, 101))
            if result["residual_error_rate"] <= adaptive["residual_error_rate"]
        )
        rows.append({
            "world": world,
            "adaptive": adaptive,
            "flat_budget_matched": flat_matched,
            "flat_base_rate": flat_base,
            "flat_equal_quality": flat_equal_quality,
            "no_qa_error_rate": 1 - statistics.fmean(accuracies),
        })

    def summary(key: str) -> dict:
        errors = [r[key]["residual_error_rate"] for r in rows]
        review_share = [r[key]["reviews"] / r[key]["tasks"] for r in rows]
        return {"mean_residual_error_rate": statistics.fmean(errors), "sd": statistics.stdev(errors),
                "mean_review_share": statistics.fmean(review_share)}

    diffs = [r["flat_budget_matched"]["residual_error_rate"] - r["adaptive"]["residual_error_rate"] for r in rows]
    mean_diff, sd_diff = statistics.fmean(diffs), statistics.stdev(diffs)
    half_width = 1.96 * sd_diff / math.sqrt(len(diffs))
    result = {
        "design": {
            "worlds": args.worlds, "annotators": ANNOTATORS, "days": DAYS,
            "tasks_per_annotator_per_day": TASKS_PER_ANNOTATOR_PER_DAY, "weak_share": WEAK_SHARE,
            "strong_accuracy_prior": "Beta(97,3)", "weak_accuracy_prior": "Beta(85,15)",
            "base_sampling_pct": args.base_rate, "target_quality_pct": args.target,
            "note": "Synthetic worlds; FLAT budget-matched receives exactly ADAPTIVE's review share.",
        },
        "adaptive": summary("adaptive"),
        "flat_budget_matched": summary("flat_budget_matched"),
        "flat_base_rate": summary("flat_base_rate"),
        "flat_equal_quality": summary("flat_equal_quality"),
        "review_saving_at_equal_quality": 1 - (
            statistics.fmean(r["adaptive"]["reviews"] for r in rows)
            / statistics.fmean(r["flat_equal_quality"]["reviews"] for r in rows)
        ),
        "paired_difference_flat_minus_adaptive": {
            "mean": mean_diff, "ci95_low": mean_diff - half_width, "ci95_high": mean_diff + half_width,
            "adaptive_better_in_worlds": sum(d > 0 for d in diffs), "worlds": len(diffs),
        },
        "worlds": rows,
    }
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "worlds"}, indent=2))


if __name__ == "__main__":
    main()
