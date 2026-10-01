"""The instant-demo snapshot must equal a freshly seeded live API and cover what the pages request."""

import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
PAGES = ROOT / "frontend" / "src" / "pages"
CAMPAIGN_ID = "demo-campaign-ai-eval"
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def load_builder() -> ModuleType:
    spec = importlib.util.spec_from_file_location("build_demo_snapshot", ROOT / "scripts" / "build_demo_snapshot.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load_builder()


@pytest.fixture(scope="module")
def snapshot(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, Any]]:
    output = tmp_path_factory.mktemp("snapshot") / "demo-snapshot"
    # A separate process: the builder points the app at its own database before importing it.
    subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "build_demo_snapshot.py"), "--output", str(output)],
        check=True,
        cwd=ROOT,
    )
    return output, json.loads((output / "manifest.json").read_text(encoding="utf-8"))


def read(output: Path, name: str) -> Any:
    return json.loads((output / name).read_text(encoding="utf-8"))


def mask(value: Any) -> Any:
    """Wall-clock timestamps and random ids differ between two seedings by design."""
    if isinstance(value, dict):
        return {k: mask(v) for k, v in value.items()}
    if isinstance(value, list):
        return [mask(v) for v in value]
    if isinstance(value, str):
        return "<time>" if TIMESTAMP.match(value) else UUID.sub("<uuid>", value)
    return value


def test_request_key_sorts_query_parameters() -> None:
    assert builder.request_key("get", "/tasks?state=A&campaign_id=c&limit=5") == "GET /tasks?campaign_id=c&limit=5&state=A"
    assert builder.request_key("GET", "/today") == "GET /today"


def test_snapshot_covers_every_page_request(snapshot: tuple[Path, dict[str, Any]]) -> None:
    output, manifest = snapshot
    keys = set(manifest["entries"])
    for endpoint in ["/campaigns", "/workers", "/calibrations", "/today", "/audit-logs"]:
        assert f"GET {endpoint}" in keys
    for suffix in ["", "/quality", "/forecast", "/delivery-readiness", "/execution", "/sla"]:
        assert f"GET /campaigns/{CAMPAIGN_ID}{suffix}" in keys
    for endpoint in ["/allocations", "/reviews", "/escalations"]:
        assert f"GET {endpoint}?campaign_id={CAMPAIGN_ID}" in keys
    for state, limit in builder.TASK_LISTS:
        assert f"GET /tasks?campaign_id={CAMPAIGN_ID}&limit={limit}&state={state}" in keys
    for state in builder.EXECUTION_STATES:
        assert f"GET /tasks?campaign_id={CAMPAIGN_ID}&limit=100&state={state}" in keys
    date = read(output, manifest["entries"][f"GET /campaigns/{CAMPAIGN_ID}"])["operational_date"]
    for worker in read(output, manifest["entries"]["GET /workers"]):
        assert f"GET /workers/{worker['id']}/capacity?date={date}" in keys

    # Every task a page lists can open its history.
    histories = read(output, manifest["task_histories"])
    listed = {
        task["id"]
        for key, name in manifest["entries"].items()
        if key.startswith("GET /tasks?")
        for task in read(output, name)
    }
    assert listed and listed <= set(histories)


def test_snapshot_equals_a_freshly_seeded_api(snapshot: tuple[Path, dict[str, Any]], client) -> None:
    output, manifest = snapshot
    assert client.post("/api/v1/demo/bootstrap?reset=false").status_code == 200
    for key, name in manifest["entries"].items():
        endpoint = key.removeprefix("GET ")
        response = client.get(f"/api/v1{endpoint}")
        assert response.status_code == 200, key
        assert mask(read(output, name)) == mask(response.json()), key

    histories = read(output, manifest["task_histories"])
    for task_id in sorted(histories)[:: max(1, len(histories) // 25)]:
        assert mask(histories[task_id]) == mask(client.get(f"/api/v1/tasks/{task_id}/history").json()), task_id


def test_builder_task_lists_match_the_pages() -> None:
    pages = "\n".join(path.read_text(encoding="utf-8") for path in PAGES.glob("*.tsx"))
    requested = {(state, int(limit)) for state, limit in re.findall(r"getTasks\(selectedId, '(\w+)', (\d+)\)", pages)}
    assert requested == set(builder.TASK_LISTS)

    execution = (PAGES / "ExecutionPage.tsx").read_text(encoding="utf-8")
    assert "getTasks(selectedId, stateFilter || undefined, 100)" in execution
    pipeline = re.search(r"const PIPELINE[^\[]*\[(.*?)\];", execution, re.DOTALL)
    assert pipeline
    assert re.findall(r"state: '(\w+)'", pipeline.group(1)) == builder.EXECUTION_STATES
