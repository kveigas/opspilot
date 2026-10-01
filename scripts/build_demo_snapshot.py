"""Pre-compute the public demo's read responses so the static frontend renders instantly.

The hosted API sleeps when idle and can take up to a minute to wake. The demo is seeded
deterministically (fixed ids for the campaign, workers, tasks and escalation), so its starting
state is captured here, at build time, by the same code that serves the live API. The
frontend shows this snapshot immediately and switches to the live API as soon as it answers;
actions always run against the live API.

Usage (from the repository root):
    python scripts/build_demo_snapshot.py --output frontend/public/demo-snapshot
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_VERSION = "demo-snapshot-1"
# Mirrors the task filters the pages request; a test keeps these in sync with the frontend.
EXECUTION_STATES = [
    "UNASSIGNED",
    "ASSIGNED",
    "IN_PROGRESS",
    "SUBMITTED",
    "IN_REVIEW",
    "BLOCKED",
    "ESCALATED",
    "COMPLETED",
]
TASK_LISTS = [("IN_REVIEW", 100), ("IN_PROGRESS", 1000), ("ASSIGNED", 1000), ("UNASSIGNED", 1000)]


def request_key(method: str, endpoint: str) -> str:
    """Canonical key shared with the frontend: method, endpoint and sorted query parameters."""
    parts = urlsplit(endpoint)
    query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
    return f"{method.upper()} {parts.path}{'?' + query if query else ''}"


def build(output: Path) -> dict[str, Any]:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    started = time.perf_counter()
    entries: dict[str, str] = {}

    with tempfile.TemporaryDirectory(prefix="opspilot-snapshot-", ignore_cleanup_errors=True) as tmp:
        # Configuration is read at import time, so point it at a throwaway database first.
        os.environ["DATABASE_PATH"] = str(Path(tmp) / "snapshot.db")
        os.environ.pop("DATABASE_URL", None)  # it would take precedence over DATABASE_PATH
        sys.path.insert(0, str(ROOT / "backend"))
        from app.main import create_app
        from fastapi.testclient import TestClient

        with TestClient(create_app()) as client:

            def fetch(endpoint: str) -> Any:
                response = client.get(f"/api/v1{endpoint}")
                if response.status_code != 200:
                    raise RuntimeError(f"GET {endpoint} -> {response.status_code}: {response.text[:300]}")
                return response.json()

            def write(body: Any) -> str:
                text = json.dumps(body, separators=(",", ":"), sort_keys=True)
                name = hashlib.sha256(text.encode()).hexdigest()[:20] + ".json"
                (output / name).write_text(text, encoding="utf-8")
                return name

            def capture(endpoint: str) -> Any:
                body = fetch(endpoint)
                entries[request_key("GET", endpoint)] = write(body)
                return body

            boot = client.post("/api/v1/demo/bootstrap?reset=false")
            if boot.status_code != 200:
                raise RuntimeError(f"bootstrap failed: {boot.status_code} {boot.text[:300]}")

            campaigns = capture("/campaigns")
            workers = capture("/workers")
            for endpoint in ["/calibrations", "/today", "/audit-logs"]:
                capture(endpoint)

            # Every task a page can list opens its history; they are bundled into one file that
            # the frontend loads only when a history dialog is first opened.
            history_ids: set[str] = set()
            for campaign in campaigns:
                cid = campaign["id"]
                for suffix in ["", "/quality", "/forecast", "/delivery-readiness", "/execution", "/sla"]:
                    capture(f"/campaigns/{cid}{suffix}")
                for endpoint in ["/allocations", "/reviews", "/escalations"]:
                    rows = capture(f"{endpoint}?{urlencode({'campaign_id': cid})}")
                    history_ids |= {row["task_id"] for row in rows if row.get("task_id")}
                task_lists = [{"state": state, "limit": limit} for state, limit in TASK_LISTS]
                task_lists += [{"limit": 100}] + [{"state": state, "limit": 100} for state in EXECUTION_STATES]
                for params in task_lists:
                    tasks = capture(f"/tasks?{urlencode({'campaign_id': cid, **params})}")
                    history_ids |= {task["id"] for task in tasks}
                operational_date = campaign.get("operational_date")
                if operational_date:
                    for worker in workers:
                        capture(f"/workers/{worker['id']}/capacity?{urlencode({'date': operational_date})}")

            task_histories = write({task_id: fetch(f"/tasks/{task_id}/history") for task_id in sorted(history_ids)})
            version = fetch("/health").get("version")

        from app.database import engine

        engine.dispose()  # release the SQLite file so the temporary directory can be removed

    manifest = {
        "snapshot_version": SNAPSHOT_VERSION,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "api_version": version,
        "entries": entries,
        "task_histories": task_histories,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    size = sum(f.stat().st_size for f in output.iterdir())
    print(
        f"Wrote {len(entries)} responses and {len(history_ids)} task histories ({size / 1e6:.1f} MB) to {output} "
        f"in {time.perf_counter() - started:.0f}s"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=(__doc__ or "Build the demo snapshot.").splitlines()[0])
    parser.add_argument("--output", type=Path, required=True)
    build(parser.parse_args().output)


if __name__ == "__main__":
    main()
