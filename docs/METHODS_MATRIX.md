# OpsPilot v1.0.0-rc1 Operational Methods & Business Rules Matrix

This document provides a comprehensive mapping of all operational mechanisms, their execution type, inputs, outputs, determinism guarantees, underlying business rules, test coverage, and user decision controls.

---

## 📋 Operational Methods Matrix

| METHOD | TYPE | INPUT | OUTPUT | DETERMINISTIC | BUSINESS_RULE_SOURCE | TEST_COVERAGE | USER_DECISION_ENABLED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`is_worker_qualified_for_campaign`** | RULES-BASED | `Worker`, `Campaign` | `bool` | YES | Conditional Qualification Rule: IF `calibration_required == True`, worker status for domain must be `PASSED`. | 100% (`test_conditional_qualification.py`) | YES (Manager toggles `calibration_required`) |
| **`check_skill_eligibility`** | RULES-BASED | `Worker.skills`, `Campaign.skills` | `bool` | YES | Skill Matching Rule: Worker must possess ALL campaign/task required skill tags. | 100% (`test_allocation_engine.py`) | YES (Manager assigns skill tags) |
| **`get_worker_daily_capacity`** | RULES-BASED | `worker_id`, `capacity_date` | `WorkerDailyCapacity` | YES | Date-Scoped Capacity Rule: `remaining = max_daily_capacity - allocated_for_date`. | 100% (`test_capacity.py`) | YES (Manager overrides daily capacity) |
| **`trigger_allocation_run`** | RULES-BASED | `campaign_id`, `date`, `max_tasks` | `AllocationRun` | YES | Deterministic Allocation: Sort eligible workers by remaining ratio desc, allocated count asc, UUID asc. Round-robin assignment. | 93% (`test_allocation_engine.py`) | YES (Manager triggers allocation run) |
| **`transition_task_state`** | RULES-BASED | `Task`, `new_state`, `reason` | `Task` | YES | 10-State State Machine: Enforces valid state graph transitions and logs audit trail. | 100% (`test_state_machine.py`) | YES (Manager/Annotator moves state) |
| **`process_review_sampling`** | RULES-BASED | `campaign_id` | `dict` (sampled/completed) | YES | QA Sampling Rule: Evaluates `review_sampling_pct`. Unsampled tasks auto-complete; sampled go to `IN_REVIEW`. | 82% (`test_reviews.py`) | YES (Manager sets sampling percentage) |
| **`submit_review`** | RULES-BASED | `ReviewCreate` | `Review` | YES | QA & Rework Rule: ACCEPT completes task; REWORK increments attempt count (max 3 allowed). | 82% (`test_rework.py`, `test_reviews.py`) | YES (Reviewer submits QA verdict) |
| **`create_escalation`** | RULES-BASED | `EscalationCreate` | `Escalation` | YES | Escalation Lifecycle: Creates open escalation; if `blocker == True`, marks task as `BLOCKED`. | 100% (`test_escalations.py`) | YES (Lead files escalation) |
| **`evaluate_campaign_sla`** | RULES-BASED | `campaign_id`, `date` | `dict` (SLA status & reasons) | YES | SLA Risk Engine: Computes required rate & $CR$. Applies hard risk overrides (`OVERDUE`, `ESCALATION_OPEN`). | 91% (`test_sla_engine.py`) | YES (Manager views Today SLA alerts) |
| **`evaluate_delivery_readiness`** | RULES-BASED | `campaign_id` | `dict` (Verdict & gates) | YES | 5-Gate Delivery Checklist: Validates volume (100%), QA sampling, quality target, 0 critical escalations, 0 blockers. | 97% (`test_delivery_readiness.py`) | YES (Manager evaluates delivery decision) |
| **`bootstrap_demo_scenario`** | RULES-BASED | `force_recreate` | `dict` (Demo summary) | YES | Public Demo Engine: Idempotently seeds 2,000 tasks, 16 workers, initial critical escalation, data provenance. | 95% (`test_demo.py`) | YES (User clicks `🚀 Load Demo Scenario`) |

---

## 🔒 Determinism Guarantee Statement

**ALL mechanisms listed above are 100% RULES-BASED and DETERMINISTIC.**

OpsPilot contains **ZERO**:
- Artificial intelligence model predictions
- Machine learning heuristics
- Non-deterministic probabilistic algorithms
- Autonomous AI agent loops
- Unpredictable background mutations

Every output is strictly derived from persisted database entity attributes, explicitly defined state machine logic, and deterministic math.
