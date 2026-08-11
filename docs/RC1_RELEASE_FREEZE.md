# OpsPilot v1.0.0-rc1 Release Freeze Specification

**Release Version**: `v1.0.0-rc1`  
**Date**: August 11, 2026  
**Status**: **FROZEN**

---

## 🎯 Scope & Purpose

OpsPilot v1.0.0-rc1 is a release-candidate operational control system for human data campaign leads. It provides rules-based workflow orchestration, capacity tracking, 10-state task execution, QA sampling, SLA risk monitoring, and delivery gate validation.

---

## 🔒 Frozen Business Rules

1. **Campaign Intake**:
   - Fields: `name`, `client_name`, `task_type`, `total_volume`, `target_quality_pct`, `review_sampling_pct`, `target_daily_throughput`, `start_date`, `due_date`, `priority`, `status`, `calibration_required`, `required_annotators`, `required_reviewers`.
   - Priority levels: `LOW`, `MEDIUM`, `HIGH`, `URGENT`.
   - Campaign Statuses: `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`.

2. **Workforce & Date-Scoped Capacity**:
   - Roles: `ANNOTATOR`, `REVIEWER`, `LEAD`, `MANAGER`.
   - Worker Statuses: `AVAILABLE`, `BUSY`, `ON_LEAVE`, `INACTIVE`, `UNAVAILABLE`.
   - Capacity tracking: Daily records (`WorkerDailyCapacity`) scoped by `capacity_date`.
   - Formula: `remaining_capacity_for_date = max_daily_capacity - allocated_for_date`.

3. **Conditional Qualification**:
   - Rule: IF `campaign.calibration_required == True`, worker qualification for the campaign must be `PASSED`.
   - ELSE: Qualification status does not block allocation.

4. **Deterministic Allocation Engine**:
   - Selection criteria: `is_active == True`, `availability == 'AVAILABLE'`, `role == 'ANNOTATOR'`, required skill tags match, qualification valid, `remaining_capacity_for_date > 0`.
   - Deterministic sorting: Highest remaining capacity ratio (`remaining / max`), lowest `allocated_for_date`, ascending `worker_id`.
   - Round-robin balancing across eligible workers until backlog or daily capacity exhausted.

5. **10-State Task Execution State Machine**:
   - Valid state graph:
     - `UNASSIGNED` → `ASSIGNED`
     - `ASSIGNED` → `IN_PROGRESS`
     - `IN_PROGRESS` → `SUBMITTED`
     - `SUBMITTED` → `IN_REVIEW` (sampled) OR `COMPLETED` (unsampled)
     - `IN_REVIEW` → `ACCEPTED` / `REWORK_REQUIRED` / `BLOCKED` / `ESCALATED`
     - `ACCEPTED` → `COMPLETED`
     - `REWORK_REQUIRED` → `ASSIGNED` (if `rework_count <= 3`) OR `ESCALATED` / `BLOCKED` (if `rework_count > 3`)
     - `BLOCKED` → `IN_PROGRESS` / `SUBMITTED` (upon resolution)
     - `ESCALATED` → `IN_PROGRESS` / `SUBMITTED` (upon resolution)

6. **QA Sampling & Review Engine**:
   - Sampling percentage: `campaign.review_sampling_pct` (0% to 100%).
   - Immutable reviews: Recorded with `task_id`, `reviewer_id`, `verdict`, `reason_code`, `comment`, `created_at`.
   - Rework attempt limit: Maximum 3 rework attempts allowed per task.

7. **Multi-Factor SLA Risk Engine**:
   - Required daily rate: `remaining_tasks / max(1, working_days_remaining)`.
   - Capacity ratio ($CR$): `available_capacity / required_daily_rate`.
   - Classification:
     - `ON_TRACK`: $CR \ge 1.10$ and no overriding conditions.
     - `AT_RISK`: $0.85 \le CR < 1.10$ (Reason: `CAPACITY_BUFFER_LOW`).
     - `CRITICAL`: $CR < 0.85$ (Reason: `INSUFFICIENT_CAPACITY`).
   - Hard overrides: `CAMPAIGN_OVERDUE`, `ZERO_ELIGIBLE_CAPACITY`, `CRITICAL_ESCALATION_OPEN`, `REVIEW_BACKLOG_CRITICAL` (>50% unreviewed), `BLOCKER_VOLUME_CRITICAL` (>15 blocked tasks).

8. **5-Gate Delivery Readiness Checklist**:
   - Gate 1: Volume Completeness (100% completed).
   - Gate 2: QA Sampling Target Met.
   - Gate 3: Quality Threshold Met.
   - Gate 4: Zero Open Critical Escalations.
   - Gate 5: Zero Blocked Tasks.

---

## 🎬 Public Demo Scenario Version

- **Scenario ID**: `demo-campaign-ai-eval`
- **Scenario Version**: `1.0.0`
- **Seed Identifier**: `SEED_OPSPILOT_DEMO_2026`
- **Synthetic Entity Baseline**:
  - 1 Demo Campaign (*"Multilingual AI Response Evaluation"*, 2,000 tasks).
  - 16 Demo Workers (12 Annotators, 3 Reviewers, 1 Manager Lead).
  - Initial `CRITICAL` SLA status with 1 open critical escalation (`Guidelines Ambiguity: Escalated Model Preference Standard`).

---

## 🚫 Non-Goals & Explicit Boundaries

OpsPilot v1.0.0-rc1 does **NOT** include:
- Artificial intelligence or machine learning model training/inference.
- LLM prompt generation, RAG, or autonomous AI agents.
- Live client production deployment or real customer personal data.
- Third-party integrations (DataQual, Slack, Jira, Zendesk, Salesforce).
- User authentication, OAuth, RBAC, or multi-tenant database partitioning.
- Billing, invoicing, vendor management, or worker payroll features.
