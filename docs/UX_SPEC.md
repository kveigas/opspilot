# OpsPilot — User Experience & Information Architecture Specification (Updated with Amendments)

## 1. Information Architecture & Primary Navigation

```
+------------------------------------------------------------------------------------------------+
|  OpsPilot  |  Today  |  Campaigns  |  Workforce  |  Allocations  |  QA & Escalations  |  Delivery  |
+------------------------------------------------------------------------------------------------+
```

### Primary Nav Views
1. **Today (`/today`)**: Manager's daily operational cockpit (SLA alerts, actionable escalations, date-scoped capacity gaps, calibration decisions).
2. **Campaigns (`/campaigns`)**: Campaign list, intake form, and campaign detail tabs.
3. **Workforce (`/workforce`)**: Worker roster grid, skill matrix, date-scoped daily capacity load, availability toggles, and calibration histories.
4. **Allocations (`/allocations`)**: Rules-based work distribution cockpit, remaining date capacity ratios, and unallocated backlog queue.
5. **QA & Escalations (`/qa-escalations`)**: Consolidated quality and escalation workspace containing review queue, review verdicts, rework log, QA reason codes, and operational escalation queue.
6. **Delivery Readiness (`/delivery`)**: Final handoff gating cockpit, 5-gate checklist, and blocking reason code diagnostics.

---

## 2. Screen Specifications

### Screen 1: Manager's "Today" Cockpit (`/today`)
- **PRIMARY_DECISION**: "What urgent operational bottlenecks require my attention right now?"
- **MAIN_INFORMATION**:
  - **SLA Risk Alerts**: Cards for campaigns in `AT_RISK` or `CRITICAL` state.
  - **Actionable Escalations**: List of `CRITICAL` or `HIGH` open escalations needing owner resolution.
  - **Unallocated Backlog Summary**: Backlog tasks awaiting eligible qualified workers.
  - **Calibration Bottlenecks**: Workers in `RETRY_REQUIRED` or pending pass/fail evaluation.
- **PRIMARY_ACTION**: Click "Resolve Escalation" or "Trigger Allocation".

---

### Screen 2: Campaigns View (`/campaigns`)
- **PRIMARY_DECISION**: "How are our active AI human-data campaigns progressing against schedule and quality targets?"
- **MAIN_INFORMATION**:
  - **Campaign Table/Grid**: Name, Client, Task Type, Volume Completed %, SLA Status badge (`ON_TRACK`, `AT_RISK`, `CRITICAL`), Due Date, Quality Target %, `calibration_required` indicator.
  - **"New Campaign Intake" Modal**: Form with real-time validation for intake fields.
- **PRIMARY_ACTION**: Click "Create New Campaign" or select row for Detail View.

---

### Screen 3: Workforce & Date-Scoped Capacity View (`/workforce`)
- **PRIMARY_DECISION**: "Who is qualified, available, and appropriately loaded for a specific operational date?"
- **MAIN_INFORMATION**:
  - **Worker Roster Grid**: Name, Role, Skill Tags, Timezone, Date-Scoped Capacity Bar (`max_daily_capacity`, `allocated_for_date`, `remaining_capacity_for_date`), Availability Status badge.
  - **Calibration Panel**: Active calibration rounds, pass threshold %, worker scores, attempt count, pass/fail status.
- **PRIMARY_ACTION**: Click "Add Worker", "Edit Date Capacity", or "Record Calibration Result".

---

### Screen 4: Work Allocation Cockpit (`/allocations`)
- **PRIMARY_DECISION**: "How should unallocated task backlogs be distributed across eligible workers for date $D$ without violating date capacity or qualification rules?"
- **MAIN_INFORMATION**:
  - **Unallocated Backlog Queue**: Unassigned task counts grouped by campaign priority and due date.
  - **Eligible Worker Capacity Matrix**: List of eligible workers for date $D$, remaining date capacity ratios, and skill match indicators.
- **PRIMARY_ACTION**: Click "Run Deterministic Allocation for Date".

---

### Screen 5: QA & Escalations View (`/qa-escalations`)
- **PRIMARY_DECISION**: "Where are data quality failures, guideline ambiguities, or tooling issues blocking production?"
- **MAIN_INFORMATION**:
  - **Review Queue & Rework Log**: Tasks in `SUBMITTED` / `IN_REVIEW` / `REWORK_REQUIRED` state with reviewer comments and QA reason codes (`LABEL_ERROR`, `GUIDELINE_AMBIGUITY`).
  - **Open Escalations Table**: Escalation ID, Campaign, Linked Task ID, Severity, Category, Owner, Age, Status (`OPEN`, `INVESTIGATING`, `RESOLVED`).
- **PRIMARY_ACTION**: Click "Submit Review Verdict" or "Resolve Escalation".

---

### Screen 6: Delivery Readiness Cockpit (`/delivery`)
- **PRIMARY_DECISION**: "Can this completed campaign batch be handed off to the client without operational risk?"
- **MAIN_INFORMATION**:
  - **5-Gate Delivery Checklist**: Volume completion gate, QA sampling gate, Critical escalation gate, Blocker gate, Quality target gate.
  - **Status Banner**: `READY`, `READY_WITH_WARNINGS`, or `NOT_READY` with explicit blocking reason codes.
- **PRIMARY_ACTION**: Click "Re-evaluate Readiness".

---

## 3. UI Design Tokens & Theme Alignment

- **Background Base**: `#05080d` (Dark Navy Black)
- **Surface Elevation 1**: `rgba(16, 28, 42, 0.94)`
- **Surface Elevation 2**: `rgba(11, 19, 29, 0.94)`
- **Primary Brand Accent**: `#059669` (Deep Emerald Green)
- **Status Colors**: `ON_TRACK` (`#10b981`), `AT_RISK` (`#f59e0b`), `CRITICAL` (`#ef4444`).
