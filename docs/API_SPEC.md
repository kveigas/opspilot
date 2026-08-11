# OpsPilot — REST API Specification (Updated with Amendments)

Base URL: `/api/v1`

---

## 1. Endpoints Overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/today` | Fetch Manager's Today operational cockpit overview |
| `GET` | `/api/v1/campaigns` | List all campaigns with filters |
| `POST` | `/api/v1/campaigns` | Create a new campaign |
| `GET` | `/api/v1/campaigns/{id}` | Get detailed campaign profile |
| `PATCH` | `/api/v1/campaigns/{id}` | Update campaign configuration |
| `GET` | `/api/v1/campaigns/{id}/metrics` | Get execution metrics snapshot |
| `GET` | `/api/v1/campaigns/{id}/sla` | Get SLA risk evaluation (`status`, `required_daily_rate`, `available_capacity`, `capacity_ratio`, `reason_codes`) |
| `GET` | `/api/v1/campaigns/{id}/delivery-readiness` | Check delivery readiness gates |
| `GET` | `/api/v1/workers` | List worker roster with availability & capacity |
| `POST` | `/api/v1/workers` | Register a new worker |
| `GET` | `/api/v1/workers/{id}/capacity` | Fetch date-scoped capacity for worker (`capacity_date`, `max_daily_capacity`, `allocated_for_date`, `remaining_capacity_for_date`) |
| `PATCH` | `/api/v1/workers/{id}/capacity` | Update date-scoped worker capacity |
| `GET` | `/api/v1/calibrations` | List calibration rounds |
| `POST` | `/api/v1/calibrations` | Create a calibration round |
| `POST` | `/api/v1/calibrations/{id}/results` | Record a worker calibration attempt |
| `POST` | `/api/v1/allocations/trigger` | Trigger deterministic work allocation for target date |
| `GET` | `/api/v1/tasks` | List campaign tasks with state filters |
| `PATCH` | `/api/v1/tasks/{id}/state` | Transition task state through valid machine states |
| `POST` | `/api/v1/qa-escalations/reviews` | Submit a QA task review verdict |
| `GET` | `/api/v1/qa-escalations/escalations` | List open/resolved escalations |
| `POST` | `/api/v1/qa-escalations/escalations` | Log a new operational escalation |
| `PATCH` | `/api/v1/qa-escalations/escalations/{id}` | Resolve or update escalation status |
| `POST` | `/api/v1/demo/bootstrap` | Reset and load deterministic demo scenario |
| `POST` | `/api/v1/demo/advance-workday` | Advance demo workday by executing valid task state transitions |

---

## 2. Key Endpoint Schemas

### `GET /api/v1/campaigns/{id}/sla` (Frozen Complete Rule Schema)
- **Response `200 OK`**:
```json
{
  "campaign_id": "c-multilingual-001",
  "status": "CRITICAL",
  "required_daily_rate": 243.0,
  "available_capacity": 180.0,
  "capacity_ratio": 0.74,
  "reason_codes": [
    "INSUFFICIENT_CAPACITY",
    "CRITICAL_ESCALATION_OPEN"
  ],
  "evaluated_at": "2026-08-11T12:00:00Z"
}
```

---

### `GET /api/v1/workers/{id}/capacity?date=2026-08-11` (Date-Scoped Capacity)
- **Response `200 OK`**:
```json
{
  "worker_id": "w-ann-01",
  "capacity_date": "2026-08-11",
  "max_daily_capacity": 35,
  "allocated_for_date": 25,
  "remaining_capacity_for_date": 10,
  "allocations_by_campaign": [
    { "campaign_id": "c-multilingual-001", "allocated_count": 25 }
  ]
}
```

---

### `POST /api/v1/allocations/trigger`
- **Request Body**:
```json
{
  "campaign_id": "c-multilingual-001",
  "target_date": "2026-08-11",
  "batch_size": 200
}
```
- **Response `200 OK`**:
```json
{
  "campaign_id": "c-multilingual-001",
  "target_date": "2026-08-11",
  "tasks_allocated_count": 180,
  "remaining_unallocated_backlog": 670,
  "allocations_by_worker": [
    {
      "worker_id": "w-ann-01",
      "assigned_count": 10,
      "remaining_capacity_for_date": 0
    },
    {
      "worker_id": "w-ann-02",
      "assigned_count": 25,
      "remaining_capacity_for_date": 5
    }
  ]
}
```

---

### `POST /api/v1/demo/advance-workday` (Valid Transition Execution)
- **Request Body**:
```json
{
  "campaign_id": "c-multilingual-001",
  "tasks_to_process": 200
}
```
- **Response `200 OK`**:
```json
{
  "campaign_id": "c-multilingual-001",
  "transitions_executed": [
    { "from": "ASSIGNED", "to": "IN_PROGRESS", "count": 200 },
    { "from": "IN_PROGRESS", "to": "SUBMITTED", "count": 200 },
    { "from": "SUBMITTED", "to": "IN_REVIEW", "count": 40 },
    { "from": "SUBMITTED", "to": "COMPLETED", "count": 160 },
    { "from": "IN_REVIEW", "to": "ACCEPTED", "count": 38 },
    { "from": "IN_REVIEW", "to": "REWORK_REQUIRED", "count": 2 }
  ],
  "recomputed_sla": {
    "status": "ON_TRACK",
    "required_daily_rate": 185.0,
    "available_capacity": 230.0,
    "capacity_ratio": 1.24,
    "reason_codes": []
  },
  "recomputed_delivery_readiness": "NOT_READY"
}
```

---

## 3. Standard HTTP Status Codes

- `200 OK`: Request succeeded.
- `201 Created`: Entity successfully created.
- `400 Bad Request`: Validation rule failure (returns exact field error details).
- `404 Not Found`: Target entity ID does not exist.
- `409 Conflict`: Uniqueness constraint violation or invalid state machine transition.
- `422 Unprocessable Entity`: Business rule violation (e.g. over-capacity allocation).
- `500 Internal Server Error`: Unexpected runtime failure.
