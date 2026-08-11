# OpsPilot — Product Specification (Updated with Amendments)

## 1. Product Positioning

- **PRODUCT_NAME**: OpsPilot — Human Data Campaign Operations Platform
- **TAGLINE**: End-to-end operational execution, workforce calibration, deterministic allocation, and delivery control for AI human-data campaigns.
- **ONE_SENTENCE_DESCRIPTION**: OpsPilot is a decision-first operations system for AI data teams that manages human-data campaigns from intake and workforce calibration through rules-based allocation, SLA risk tracking, and delivery readiness gating.
- **PRIMARY_USER**: AI Data Operations Manager / Human Data Operations Manager / AI Evaluation Operations Lead / Annotation Program Manager / Technical Project & Program Operations Professional.
- **SECONDARY_USERS**: Annotation Team Leads, Quality Auditors, Operations Coordinators.
- **PRIMARY_JOB_TO_BE_DONE**: "Track what work is coming in, determine who is qualified to perform it, allocate tasks deterministically by date, surface operational risks and escalations in real-time, and verify delivery readiness before handoff."
- **KEY_USER_PAIN**: AI data campaigns suffer from opaque worker qualification, spreadsheet-driven allocation bottlenecks, untracked SLA risks, unmonitored review backlogs, and premature delivery of incomplete or unverified task batches.
- **VALUE_PROPOSITION**: Provides complete operational visibility and deterministic control over AI data campaigns without generic dashboards, fake AI, or statistical overhead.
- **WHY_THIS_IS_DIFFERENT_FROM_DATAQUAL**:
  - **DataQual**: Focuses on *quality intelligence, statistical consensus (Dawid–Skene), Krippendorff's Alpha, annotator uncertainty modeling (Beta-Binomial shrinkage), and algorithmic review prioritization (Expected Review Value)*.
  - **OpsPilot**: Focuses on *campaign execution, workforce roster management, calibration rounds, rules-based capacity allocation, SLA risk engines, escalation management, and delivery readiness gating*.

---

## 2. MVP Core Workflow

The flagship workflow represents the complete lifecycle of a human-data campaign:

```mermaid
flowchart LR
    A[1. Campaign Intake] --> B[2. Workforce Setup]
    B --> C[3. Calibration Round]
    C --> D[4. Work Allocation]
    D --> E[5. Production Execution]
    E --> F[6. QA & Escalations]
    F --> G[7. Delivery Readiness]
```

---

## 3. MVP Module Scope & Capabilities

### A. Campaign Intake
- **USER_ACTION**: Define a new AI data campaign with target volume, task type, schedule, target throughput, quality target, review sampling rate, required worker skills, and `calibration_required` boolean flag.
- **SYSTEM_BEHAVIOR**: Validates inputs, creates the campaign record, computes daily required throughput rate, and initializes campaign metrics snapshot.
- **DECISION_ENABLED**: Determines campaign feasibility, required workforce staffing levels, and calibration prerequisites.
- **REQUIRED_DATA**: Campaign name, client/project label, task type, total volume, start date, due date, target daily throughput, quality target %, review sampling %, priority, required skill tags, `calibration_required` boolean.
- **OUTPUT**: Active campaign profile ready for workforce staffing and allocation.

### B. Workforce & Date-Scoped Capacity Management
- **USER_ACTION**: Register annotators/reviewers/leads, assign skill tags, define daily capacity records by date (`capacity_date`), timezone, and availability state.
- **SYSTEM_BEHAVIOR**: Tracks worker capacity and allocated load strictly by operational date (`capacity_date`, `max_daily_capacity`, `allocated_for_date`, `remaining_capacity_for_date`). Enforces multi-campaign capacity competition rules.
- **DECISION_ENABLED**: Identifies qualified worker candidates, remaining date-scoped capacity, and skill shortfalls across active campaigns.
- **REQUIRED_DATA**: Worker ID, name, email, role, skill tags, timezone, availability status, date-scoped daily capacity records.
- **OUTPUT**: Dynamic worker roster with date-scoped capacity and qualification tracking.

### C. Conditional Qualification Workflow
- **USER_ACTION**: Create a calibration round for a campaign (if `calibration_required == True`), set pass threshold %, assign candidate workers, and record calibration task results.
- **SYSTEM_BEHAVIOR**:
  - `IF campaign.calibration_required == True`: Evaluates score against pass threshold and attempt limits; worker status must be `PASSED` to be eligible for allocation.
  - `ELSE`: Qualification status does NOT independently block allocation (active, available, role, skills, remaining capacity rules still apply).
- **DECISION_ENABLED**: Enforces domain competency checks when required by campaign policy while allowing uncalibrated allocation for non-calibration campaigns.
- **REQUIRED_DATA**: Campaign `calibration_required` flag, calibration round ID, domain tag, pass threshold %, max attempts, worker attempts and scores.
- **OUTPUT**: Immutable calibration records and updated worker qualification flags.

### D. Work Allocation Engine
- **USER_ACTION**: Trigger deterministic work allocation for unassigned task batches on a target date $D$.
- **SYSTEM_BEHAVIOR**: Filters eligible workers (active, available, matching role and skills, qualified if calibration required, `remaining_capacity_for_date > 0`) and distributes task batches based on campaign priority and remaining date capacity.
- **DECISION_ENABLED**: Eliminates manual assignment overhead and prevents over-allocation or unqualified task assignments.
- **REQUIRED_DATA**: Unassigned task backlog, worker qualifications, date-scoped worker capacity records, campaign priorities.
- **OUTPUT**: Deterministic batch allocation records and updated worker load metrics for date $D$.

### E. Execution Dashboard
- **USER_ACTION**: Monitor real-time campaign progress, throughput rates, completion velocity, and worker utilization.
- **SYSTEM_BEHAVIOR**: Computes completion %, daily observed throughput vs required rate, projected completion date, and worker load distribution.
- **DECISION_ENABLED**: Informs capacity adjustments, shift reallocations, and throughput pacing interventions.
- **REQUIRED_DATA**: Total task volume, completed tasks, in-progress tasks, remaining backlog, daily task completion logs.
- **OUTPUT**: Real-time decision-driving execution metrics.

### F. QA & Escalation Management (Nav: `QA & Escalations`)
- **USER_ACTION**: Review task outputs (accept, rework, block), log QA reason codes (`LABEL_ERROR`, `GUIDELINE_AMBIGUITY`), or log operational escalations (`OPEN` -> `RESOLVED`).
- **SYSTEM_BEHAVIOR**: Transitions task states through valid machine states (`ASSIGNED` -> `IN_PROGRESS` -> `SUBMITTED` -> `IN_REVIEW` -> `ACCEPTED` / `REWORK_REQUIRED`), logs reviewer feedback, and manages the escalation queue.
- **DECISION_ENABLED**: Identifies quality bottlenecks, guideline gaps, and blocking operational issues requiring manager resolution.
- **REQUIRED_DATA**: Task ID, reviewer ID, verdict, QA reason code, reviewer comments, escalation severity, category, owner, resolution status.
- **OUTPUT**: QA review log, rework task queue, and active escalation queue.

### G. Delivery Readiness Engine
- **USER_ACTION**: Evaluate delivery readiness for a completed or near-completion campaign/batch.
- **SYSTEM_BEHAVIOR**: Executes deterministic readiness gates (volume completion 100%, QA sampling threshold met, zero open critical escalations, zero blocked tasks, quality target met).
- **DECISION_ENABLED**: Prevents premature client delivery of incomplete or unverified data batches.
- **REQUIRED_DATA**: Campaign completion metrics, review sampling %, open escalation counts, blocked task count, observed quality score.
- **OUTPUT**: Delivery status (`READY`, `READY_WITH_WARNINGS`, `NOT_READY`) with explicit blocking reason codes.

---

## 4. Edge Cases & Handling Strategy

1. **Zero Eligible Workers**: System flags campaign status as `CRITICAL`, surfaces `ZERO_ELIGIBLE_CAPACITY` reason code, and alerts manager in Today view.
2. **Campaign Already Overdue**: System marks SLA status as `CRITICAL` with reason code `CAMPAIGN_OVERDUE`, calculating required emergency throughput.
3. **Multi-Campaign Capacity Competition**: Allocating tasks for Campaign $A$ on date $D$ updates worker $W$'s `allocated_for_date(W, D)`, immediately reducing remaining capacity for Campaign $B$.
4. **Calibration Failures Exceeding Max Attempts**: Worker status locked to `FAILED`; manager alerted to assign replacement candidates.
5. **Review Backlog Exceeds Production Pace**: SLA engine surfaces `REVIEW_BACKLOG_HIGH` or `REVIEW_BACKLOG_CRITICAL` risk status; prompts reviewer capacity reallocation.
6. **Critical Escalation Open at 100% Task Completion**: Delivery readiness engine enforces `NOT_READY` with reason code `CRITICAL_ESCALATION_OPEN`.

---

## 5. Out of Scope — V1 Boundary

To prevent scope creep, the following features are explicitly excluded from V1:
- No generative AI, LLM assistants, or artificial chat interfaces.
- No predictive machine learning or black-box forecasting models.
- No statistical annotator modeling (Dawid-Skene, Beta-Binomial shrinkage, or ERV) — handled by DataQual.
- No payroll, invoicing, timesheet tracking, or vendor contracting.
- No multi-tenant enterprise SSO or RBAC infrastructure.
- No Slack/Jira/Email notifications — lightweight in-app audit logs only.
