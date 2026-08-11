# OpsPilot v1.0.0-rc1 Release Notes

**Release Date**: August 11, 2026  
**Build Status**: **RC1 RELEASE CANDIDATE READY**

OpsPilot v1.0.0-rc1 is the initial release candidate for the OpsPilot Human Data Campaign Operations Control System.

---

## 🌟 Key Highlights & Included Features

1. **Campaign Lifecycle Intake & Operational Configuration**:
   - Manages target volume, daily throughput, quality thresholds, review sampling percentages, priority levels, and mandatory calibration flags.

2. **Workforce Roster & Date-Scoped Capacity Tracker**:
   - Scopes worker daily capacity by operational date, computing real-time remaining capacity (`max_daily_capacity - allocated_for_date`).

3. **Domain Calibration & Conditional Qualification Engine**:
   - Evaluates domain qualification rounds, attempt tracking, and deterministic pass thresholds. Allocation respects `calibration_required`.

4. **Deterministic Task Allocation Engine**:
   - Round-robin allocation sorting eligible annotators by remaining capacity ratio, allocated count, and UUID.

5. **10-State Task Execution State Machine**:
   - Validates state transitions (`UNASSIGNED` → `ASSIGNED` → `IN_PROGRESS` → `SUBMITTED` → `IN_REVIEW` → `ACCEPTED` / `REWORK_REQUIRED` / `BLOCKED` / `ESCALATED` → `COMPLETED`).

6. **QA Review Sampling & Rework Attempt Enforcement**:
   - Automatically completes unsampled tasks based on `review_sampling_pct`; sends sampled tasks to `IN_REVIEW` with an immutable QA review log and maximum 3 rework attempt enforcement.

7. **Multi-Factor SLA Risk Engine**:
   - Computes required daily rate and capacity ratio ($CR$). Evaluates `ON_TRACK`, `AT_RISK`, and `CRITICAL` statuses with hard risk overrides.

8. **5-Gate Mandatory Delivery Readiness Checklist**:
   - Validates Volume Completeness (100%), QA Sampling Target, Quality Threshold, Zero Open Critical Escalations, and Zero Blocked Tasks.

9. **Deterministic Public Demo Engine**:
   - Idempotently seeds 2,000 tasks and 16 workers, simulating realistic operational bottlenecks and 6-step manager recovery walkthrough.

---

## 📊 Quality Gate Verification Metrics

- **Backend Pytest Coverage**: **92%** (38 / 38 unit & integration tests passing).
- **Backend Code Quality**: **0 Ruff errors**, **0 Pyright type errors**.
- **Frontend Code Quality**: **0 TypeScript errors**, **0 ESLint errors**, **10 / 10 Vitest unit tests passing**.
- **Playwright E2E Test Suite**: **13 / 13 E2E tests passing** sequentially.
- **Axe Accessibility Suite**: **0 serious, 0 critical accessibility violations** (`WCAG 2.1 AA`).

---

## 📄 License & Attribution

Licensed under the Apache License 2.0. Copyright 2026 Kevin Prashant Veigas.
