from __future__ import annotations

import json
from types import SimpleNamespace

from app.durable_runtime import DurableRuntimeClient


class FakeResponse:
    def __init__(self, payload: dict) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def settings(**overrides):
    values = {
        "durable_runtime_url": "https://runtime.example/api/durable/runtime",
        "durable_runtime_operation_token": "test-token",
        "durable_context_cache_ttl_seconds": 120,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_get_forwards_query_and_operation_token(monkeypatch):
    requests = []

    def urlopen(request, timeout):
        requests.append((request, timeout))
        return FakeResponse({"ok": True})

    monkeypatch.setattr("app.durable_runtime.urllib.request.urlopen", urlopen)
    client = DurableRuntimeClient(settings())

    assert client.get("status", {"scope": "public"}) == {"ok": True}
    request, timeout = requests[0]
    assert request.full_url == "https://runtime.example/api/durable/runtime/status?scope=public"
    assert request.get_header("X-pannes-operation-token") == "test-token"
    assert timeout == 8


def test_post_encodes_json_and_skips_empty_runtime_url(monkeypatch):
    requests = []

    def urlopen(request, timeout):
        requests.append((request, timeout))
        return FakeResponse({"count": 1})

    monkeypatch.setattr("app.durable_runtime.urllib.request.urlopen", urlopen)
    client = DurableRuntimeClient(settings())

    assert client.post("query", {"address_id": 4}) == {"count": 1}
    request, _timeout = requests[0]
    assert request.method == "POST"
    assert json.loads(request.data) == {"address_id": 4}
    assert request.get_header("Content-type") == "application/json"

    disabled = DurableRuntimeClient(settings(durable_runtime_url=""))
    assert disabled.get("status") is None
    assert disabled.post("query", {}) is None
