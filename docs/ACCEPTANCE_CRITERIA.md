# OpsPilot — Acceptance Criteria & Verification Protocol (Updated with Amendments)

## 1. End-to-End Functional Acceptance Criteria

An OpsPilot release passes validation if and only if all of the following 10 objective test scenarios execute with 100% success:

### Gate 1: Campaign Intake Validation
- **Scenario**: Manager submits new campaign form.
- **Criteria**:
  - Valid payload creates campaign with status `DRAFT` and correct computed daily throughput.
  - Invalid payload (e.g. `due_date < start_date` or `total_volume = 0`) returns `400 Bad Request` with field error message.

### Gate 2: Conditional Qualification Enforcement
- **Scenario**: System evaluates worker eligibility under `calibration_required == True` vs `False`.
- **Criteria**:
  - `IF calibration_required == True`: Worker MUST have `PASSED` status in `worker_qualifications` for the domain tag to be allocated.
  - `ELSE IF calibration_required == False`: Worker qualification status does NOT independently block allocation (active, available, role, skills, date capacity rules still enforced).

### Gate 3: Date-Scoped Worker Capacity Tracking
- **Scenario**: Manager evaluates and allocates tasks for specific operational date $D$.
- **Criteria**:
  - Capacity is tracked by date (`capacity_date`, `max_daily_capacity`, `allocated_for_date`, `remaining_capacity_for_date`).
  - Allocation for date $D$ NEVER exceeds `remaining_capacity_for_date`.
  - Task allocation on date $D$ for Campaign $A$ immediately updates `allocated_for_date` and reduces remaining capacity for Campaign $B$ on date $D$.

### Gate 4: Calibration Round Execution
- **Scenario**: Manager creates calibration round and records test scores.
- **Criteria**:
  - Worker scoring $\ge \text{threshold}$ transitions to `PASSED`.
  - Worker scoring $<\text{threshold}$ with max attempts reached transitions to `FAILED` and is locked out of calibration allocation.

### Gate 5: Deterministic Work Allocation Engine
- **Scenario**: Manager triggers work allocation for target date.
- **Criteria**:
  - Engine assigns tasks ONLY to eligible workers (active, available, matching role and skills, qualified if required, `remaining_capacity_for_date > 0`).
  - Ineligible or over-capacity workers receive 0 tasks.

### Gate 6: Task State Machine & Invalid Transition Guard
- **Scenario**: Tasks transition through valid execution states (`ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `SUBMITTED` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `ACCEPTED` $\rightarrow$ `COMPLETED`).
- **Criteria**:
  - Valid state transitions succeed and log audit events.
  - Invalid transitions (e.g. `UNASSIGNED` $\rightarrow$ `COMPLETED` or `BLOCKED` $\rightarrow$ `COMPLETED`) raise `409 Conflict` exception.

### Gate 7: QA & Escalations Navigation Workspace
- **Scenario**: Manager interacts with `QA & Escalations` view.
- **Criteria**:
  - Consolidated view contains review queue, review verdicts, rework log, QA reason codes, and escalation queue.
  - Submitting review verdict (`REWORK_REQUIRED`) or resolving escalation (`RESOLVED`) updates SLA risk and delivery gates immediately.

### Gate 8: Complete SLA Risk Engine & Overrides
- **Scenario**: System evaluates SLA risk for active campaigns.
- **Criteria**:
  - Calculates $R_{\text{req}}$, $C_{\text{avail}}$, $CR = \frac{C_{\text{avail}}}{R_{\text{req}}}$.
  - Correctly sets status (`ON_TRACK`, `AT_RISK`, `CRITICAL`) and evaluates mandatory overrides (`CAMPAIGN_OVERDUE`, `ZERO_ELIGIBLE_CAPACITY`, `CRITICAL_ESCALATION_OPEN`, `REVIEW_BACKLOG_HIGH`, `BLOCKER_VOLUME_HIGH`).
  - Endpoint `/api/v1/campaigns/{id}/sla` exposes `status`, `required_daily_rate`, `available_capacity`, `capacity_ratio`, `reason_codes`.

### Gate 9: Delivery Readiness Engine Gating
- **Scenario**: Manager checks delivery readiness for campaign.
- **Criteria**:
  - Returns `NOT_READY` with explicit blocking reason codes when any of 5 gates fails.
  - Returns `READY` when all 5 gates pass.

### Gate 10: Deterministic Demo Valid Transition Advancement
- **Scenario**: Visitor advances demo workday and reaches `READY`.
- **Criteria**:
  - "Advance Demo Workday" executes task state transitions through real state machine (`ASSIGNED` $\rightarrow$ `COMPLETED`).
  - Does NOT directly overwrite completion or delivery status.
  - Final `READY` state emerges naturally from re-evaluating business rules after state transitions.

---

## 2. Automated Testing Requirements

### Backend Tests (Pytest)
- **Unit Tests**: Coverage $\ge 90\%$ for business rules engine, date-scoped capacity manager, SLA risk calculator, and delivery readiness gates.
- **API Integration Tests**: Complete endpoint suite verifying request/response schemas, status codes, and database constraints.

### Frontend Tests (Vitest + Playwright)
- **Unit & Component Tests**: Store actions, state machine transitions, component rendering.
- **E2E Playwright Tests**: Full end-to-end user workflow execution from intake through delivery readiness.
- **Accessibility Checks**: Axe-core automated accessibility checks with zero violations.

---

## 3. Automated Verification Commands

```bash
# Backend Verification
pytest tests/ -v --cov=app

# Frontend Verification
pnpm --dir frontend typecheck
pnpm --dir frontend test:unit
pnpm --dir frontend build
pnpm --dir frontend test:e2e
```
