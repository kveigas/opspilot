# OpsPilot: technical reassessment and local improvements

Review window: 29–30 September 2026. Starting checkout: `f36ef4f`, main. The existing `v1.0.0-rc1` tag and live deployment were not changed. All new work remains local for review.

## Verdict

OpsPilot's useful core is an explainable operations workflow, not an AI prediction engine. The most important improvement is making operational state, capacity and audit evidence remain consistent when a request fails. More charts, a chatbot, or an optimizer would not compensate for partial commits.

The review covered backend service transitions, allocation/QA/escalation paths, demo controls, audit/read behavior, frontend API failure states, navigation, dialogs, responsive pages, existing tests and deployment assumptions. This is not a penetration test or proof of production readiness.

## Findings and implemented corrections

| Finding | Implemented change |
|---|---|
| Nested service commits could persist half an operation | Composable atomic transaction boundary for allocation/release, QA/review, transitions, escalation, capacity and demo operations. Nested services flush; outer operation commits or rolls back tasks, reviews and audit together. |
| Demo workday made many commits | One atomic operation for the complete workday. Failure injected at the fifth transition leaves tasks, reviews and audit unchanged. Local 400-task step measured approximately 1.2 seconds in an isolated test; not a hosted SLA or universal speed claim. |
| Allocation could store the string `None` as a task's allocation ID | Assign the UUID before linking the task. Regression checks both sides of the relationship. |
| Task-specific skills and priority were not enforced consistently | Require union of campaign/task skills; deterministic priority, creation time and ID ordering; one blocking reason per unallocated task. |
| Manual capacity update could reset load or erase active reservations | Omitted allocated load is preserved; bounds and active allocation lower bound enforced. External reservations remain possible and auditable. |
| Releasing an active allocation could reopen completed/QA work | Release only unstarted ASSIGNED work; completed state and QA evidence remain intact. |
| GET cockpit/SLA/delivery calls generated audit activity | Read paths now evaluate without recording operational changes; punctuation in stored status summaries is normalized for genuine change detection. |
| Open-escalation count covered only critical issues | Count all open escalations, retaining a separate critical subset. |
| Demo reset accumulated orphan task skills or matched unrelated records too broadly | Purge task skills and target explicit demo-owned IDs. Workday advancement rejects a non-demo campaign. |
| Failed initial reads could trigger destructive bootstrap | Auto-bootstrap only after a successful empty-state response, and use non-resetting bootstrap. A network/404 error does not reset data. |
| Demo actions could overlap or be retried as mutations | Shared pending-action guard across controls; POST retries removed. Explicit reset confirmation. This is not server-side idempotency. |
| QA responses could overwrite a newer campaign selection | Sequence guard and parallel query loading; clear refresh failures. A saved action followed by a failed refresh is not presented as an unsaved action to retry. |
| Dialogs lacked complete keyboard behavior | Portaled dialog, inert background, initial focus, Tab/Shift-Tab containment, Escape, focus restoration and internal scrolling. |
| Dashboard emphasized counts without a next action | Evidence-based decision brief with open escalations, unallocated tasks, awaiting-QA count, delivery candidates, refresh time and direct navigation. No predictive claims. |
| Responsive/keyboard gaps | Wrapping header, accessible touch targets, focus indication, keyboard-scrollable tables, corrected contrast/heading hierarchy, reduced-motion support. |

## What is real and what remains simulation

Real: persisted SQLAlchemy records, deterministic qualification/allocation rules, task state validation, QA decisions, rework/escalation handling, delivery gates and audit records.

Synthetic: the 2,000-task/16-worker demonstration, generated task outcomes, scripted workday progression and sample qualifications. None demonstrate measured human productivity or a learned quality model. SLA outputs are rules-based risk classifications, not calibrated predictions. Round-robin allocation is a heuristic, not a globally optimal or formally fair schedule.

## Evidence and validation

- Backend suite: 45 tests passing; measured total coverage 92.76%, above the existing 90% gate.
- New regressions: one commit per workday, complete failure rollback, no reset skill accumulation, GET audit purity, noncritical escalation counts, priority/skills/ID invariants, capacity preservation and completed-work release rejection.
- Frontend: 20 unit tests passed; production build, TypeScript and ESLint checks passed. Tests cover reset confirmation, non-destructive bootstrap and dialog keyboard behavior, in addition to existing page/API tests. A further 16 Playwright tests passed across accessibility, responsive layouts and full operational state flows.
- Browser validation uses local isolated storage, not the hosted API. Both desktop 1440px and mobile 390px widths are checked, including navigation, reset cancellation, workday advancement and QA access. The external review bundle contains screenshots and full accessibility/console results.
- Known test warnings include older Pydantic configuration, Starlette/httpx compatibility, SQLAlchemy cyclic-table teardown and some frontend React `act` warnings. These are not silently suppressed or treated as browser failures.

## Engineering/research basis

Use one transaction for one business operation; partial audit/state commits break the meaning of an operational history. The implementation applies the transaction-boundary pattern described by [SQLAlchemy](https://docs.sqlalchemy.org/en/20/orm/session_transaction.html). The SQLite writer reservation is specific to SQLite; it is not evidence of correct PostgreSQL concurrency.

Keyboard behavior follows the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Automated scans cannot certify accessibility; real screen-reader and manager-workflow testing still matters.

A future constrained planner should use a vetted solver such as [OR-Tools assignment/CP-SAT](https://developers.google.com/optimization/assignment/assignment_teams), not a custom optimizer. Compare it with the deterministic baseline on small enumerated instances, adversarial infeasible cases, capacity/skills/qualification invariants, solve-time limits and explicitly chosen objectives. “Fairness” needs a defined policy; balancing task counts alone is not enough.

Implementing the transparent state machine, transaction tests and an auditable heuristic from scratch is appropriate for a portfolio. Reimplementing a constraint solver, distributed job system or authentication stack is not.

## Remaining risks and deployment requirements

1. **Public demo isolation:** authentication, authorization and tenant ownership are absent. Reset confirmation protects against an accidental click, not malicious API callers. Keep only synthetic data on a shared public backend.
2. **Concurrency scope:** decorated operations reserve the SQLite writer before reading state. This serializes those SQLite writes, but is not a distributed concurrency proof. Other service writes still need a common unit-of-work boundary. PostgreSQL requires row locks/optimistic versions and uniqueness constraints plus race tests.
3. **Idempotency:** disabling UI buttons and removing automatic retries do not prevent duplicated operations after network ambiguity. Add server request keys and replay-safe responses before real multi-user use.
4. **Relational integrity:** audit and migrate old invalid allocation links before enabling stronger constraints on an existing DB. SQLite foreign-key enforcement, cyclic task/allocation relationships and migration tooling need deliberate rollout; do not silently rewrite production data.
5. **Capacity semantics:** manual load can include external reservations. Model those separately from active allocations in a future migration, instead of treating a mutable counter as the sole source of truth.
6. **Time and forecasting:** the demo uses fixed operational dates and ages relative to today's clock. Introduce an explicit simulation clock before claiming a repeatable “healthy” end state. Real SLA forecasting needs uncertainty and backtesting, not renamed threshold rules.
7. **QA validity:** deterministic sampling and synthetic verdicts are demonstrations. Real programs need sampling coverage by stratum, policy versioning, reviewer agreement, blind review and uncertainty around acceptance rates.
8. **Data safety:** deployment backup/restore, durable disks, access logs, retention and PII controls are not established by local tests.
9. **Scale:** repeated per-worker/per-campaign queries, browser row limits and SQLite serialization need profiling under real workload distributions. Current local timings are not load tests.
10. **UX completeness:** future increments should add shareable route/filter state, deliberate pagination for every large queue and a single task evidence/history view. Screen-reader, touch and user task-completion tests remain necessary.

## Recommended sequence

1. Review this local revision visually and run the test/build gate; commit only after approval.
2. Fix the deployment boundary: decide public synthetic demo versus authenticated client-data product. Add durable storage, ownership, safe reset policy and restore tests accordingly.
3. Add server-side idempotency and race-condition integration tests before scaling beyond one SQLite process.
4. Improve QA evidence and historical task detail; measure manager task-completion success.
5. Benchmark an optional constrained planner against the current deterministic baseline. Adopt only if it improves a defined objective without violating rules or degrading explainability.

---

## Addendum — second pass, 30 September 2026

Still local, uncommitted and undeployed.

### Defects found and fixed

| Defect | Fix |
| --- | --- |
| QA sampling reviewed the *oldest* submitted tasks, biasing quality estimates | Random selection (fixed-size for FLAT, Poisson per task for ADAPTIVE) with each task's inclusion probability stored |
| Execution **Start/Submit/Block** and Allocation **Release** buttons called a non-existent endpoint (and Release passed an allocation ID as a task ID) | Client uses `PATCH /tasks/{id}/state` and `POST /allocations/{id}/release`; tests pin both contracts |
| First load showed "Unable to start the demo" while data loaded (React StrictMode ran the bootstrap twice) | Single-flight bootstrap shared by concurrent callers |
| Timestamps lacked a UTC offset, so browsers showed UTC as local time | `UTCDateTime` column type returns timezone-aware values |
| Fixed demo dates aged against the real clock (permanently `CAMPAIGN_OVERDUE`) | Explicit per-campaign simulation clock advanced by the workday |
| Demo engine capped work at 400 tasks/200 reviews per day regardless of capacity, contradicting SLA/forecast | Production follows allocation (capacity-bounded); reviews follow reviewer capacity |
| Campaign/worker/task/calibration writes committed before their audit record | All wrapped in the `@atomic` unit of work |
| No server-side idempotency | `Idempotency-Key` middleware: replay, conflict and mismatch handling; key released on server failure. Client sends keys and retries safely |
| Unpinned backend installs in CI and Render; CI ran live-site and portfolio specs | `backend/requirements.txt` + `requirements-dev.txt`; external specs opt-in via `OPSPILOT_E2E_EXTERNAL=1` |
| Several accessibility issues (unassociated form labels, low-contrast text, ambiguous repeated button names, invalid `dl` markup), missing favicon | Fixed; axe passes on all nine views |

### New capabilities

- **Adaptive trust-based QA** (`quality_service.py`): Beta posterior per annotator, tiered review rates, design-weighted (Hájek) quality estimates with intervals, delivered-accuracy estimate, review-effort comparison. Budget-matched simulation: half the undetected errors at the same review budget; 43% fewer reviews at equal quality ([evidence](evidence/ADAPTIVE_QA.md)).
- **Quality-aware routing**: high-priority tasks go to the strongest QA tier, balanced within the tier; every allocation records its reason.
- **Delivery gate on delivered accuracy** rather than raw first-pass acceptance; the review requirement follows the actual sampling design.
- **Monte Carlo completion forecast** with P50/P90 dates, on-time probability and explicit assumptions.
- **Task history** endpoint and dialog; additive schema migration for RC1 databases.
- **Interface**: URL routing, shared campaign selector, simulated-day indicator, next-best-action cockpit, keyboard-first QA queue, Quality insights page, help/glossary (`?`), plain-language reasons.

### Verification

Backend 70 tests, 94% coverage; ruff and pyright clean. Frontend 34 unit tests, typecheck, lint, build. Playwright against isolated local servers: 9 axe views, 4 operational flows, recruiter journey, 4 responsive sizes — all passing.

### Still open

Authentication/tenancy, PostgreSQL concurrency tests, hosted backup/restore, reviewer-error modelling (the estimators assume correct verdicts), drift detection for annotator quality over time, and backtesting the forecast on real throughput data.
